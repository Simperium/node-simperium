"use strict";

var _util = require("util");

var _events = require("events");

var _bucket = _interopRequireDefault(require("./bucket"));

var _channel = _interopRequireDefault(require("./channel"));

var _default = _interopRequireDefault(require("./ghost/default"));

var _default2 = _interopRequireDefault(require("./storage/default"));

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var WebSocketClient;

if (typeof window !== 'undefined' && window.WebSocket) {
  WebSocketClient = window.WebSocket;
} else {
  WebSocketClient = require('websocket').w3cwebsocket;
}

module.exports = Client;
module.exports.Bucket = _bucket.default;
module.exports.Channel = _channel.default;
/**
 * @function
 * @name bucketStoreProvider
 * @param {Bucket} - the bucket to create a store instance for
 * @returns {BucketStore} - the bucket store instance to be used by the bucket
 */

/**
 * @function
 * @name ghostStoreProvider
 * @param {Bucket} - the bucket to create a store instance for
 * @returns {GhostStore} - the ghost store instance to be used by the bucket
 */

/**
 * A Client is the main interface to Simperium.
 *
 * @param {String} appId - Simperium application id
 * @param {String} accessToken - User access token
 * @param {Object} options - configuration options for the client
 * @param {ghostStoreProvider} [options.ghostStoreProvider=defaultGhostStoreProvider]
 *            - factory function for creating ghost store instances
 * @param {bucketStoreProvider} [options.objectStoreProvider=defaultObjectStoreProvider]
 *            - factory function for creating object store instances
 * @param {number} [heartbeatInterval=4] - heartbeat interval for maintaining connection status with Simperium.com
 */

function Client(appId, accessToken, options) {
  options = options || {};
  options.ghostStoreProvider = options.ghostStoreProvider || _default.default;
  options.objectStoreProvider = options.objectStoreProvider || _default2.default;
  options.hearbeatInterval = options.heartbeatInterval || 4;
  this.accessToken = accessToken;
  this.open = false;
  this.options = options;
  this.heartbeat = new Heartbeat(options.hearbeatInterval, this.sendHeartbeat.bind(this));
  this.heartbeat.on('timeout', this.onConnectionTimeout.bind(this));
  this.reconnectionTimer = new ReconnectionTimer(function (attempt) {
    var time = (attempt >= 3 ? (attempt - 3) * 3000 : 0) + 3000;
    return time;
  }, this.onReconnect.bind(this));
  this.appId = appId;
  options.url = options.url || (0, _util.format)('wss://api.simperium.com/sock/1/%s/websocket', this.appId);
  this.reconnect = true;
  this.on('message:h', this.onHeartbeat.bind(this));
  this.buckets = [];
  this.connect();
}

(0, _util.inherits)(Client, _events.EventEmitter);
/**
 * Set up a bucket with the given name for interacting with Simperium.
 *
 * @param {String} name - the bucket name on simperium
 * @returns {Bucket} a bucket instance configured for syncing
 */

Client.prototype.bucket = function (name) {
  var channelId = this.buckets.length,
      bucket = new _bucket.default(name, this.options.objectStoreProvider),
      channel = new _channel.default(this.appId, this.accessToken, this.options.ghostStoreProvider(bucket), name),
      send = this.sendChannelMessage.bind(this, channelId),
      receive = channel.handleMessage.bind(channel);
  bucket.setChannel(channel);
  this.buckets.push(bucket);
  channel.on('unauthorized', this.onUnauthorized.bind(this));
  channel.on('send', send);
  this.on('connect', channel.onConnect.bind(channel));
  this.on((0, _util.format)('channel:%d', channelId), receive);
  this.on('access-token', function (token) {
    channel.access_token = token;
  });
  if (this.open) channel.onConnect();
  return bucket;
};

Client.prototype.onHeartbeat = function (message) {
  var counter = parseInt(message);
  this.heartbeat.tick(counter);
};

Client.prototype.onConnect = function () {
  this.open = true;
  this.emit('connect');
  this.heartbeat.start();
  this.reconnectionTimer.reset();
};

Client.prototype.onReconnect = function (attempt) {
  this.emit('reconnect', attempt);
  this.connect();
};

Client.prototype.onConnectionTimeout = function () {
  this.disconnect();
};

Client.prototype.onConnectionFailed = function () {
  this.emit('disconnect');
  if (this.reconnect) this.reconnectionTimer.start();
};

Client.prototype.onMessage = function (message) {
  this.parseMessage(message);
  this.heartbeat.tick();
};

Client.prototype.onUnauthorized = function (details) {
  this.reconnect = false;
  this.emit('unauthorized', details);
};

Client.prototype.parseMessage = function (event) {
  var data = event.data,
      marker = data.indexOf(':'),
      prefix = data.slice(0, marker),
      channelId = parseInt(prefix),
      channelMessage = data.slice(marker + 1);
  this.emit('message', data);

  if (isNaN(channelId)) {
    this.emit((0, _util.format)('message:%s', prefix), channelMessage);
  } else {
    this.emit((0, _util.format)('channel:%d', channelId), channelMessage);
  }
};

Client.prototype.sendHeartbeat = function (count) {
  this.send((0, _util.format)('h:%d', count));
};

Client.prototype.send = function (data) {
  this.emit('send', data);

  try {
    this.socket.send(data);
  } catch (e) {// failed to send, probably not connected
  }
};

Client.prototype.sendChannelMessage = function (id, message) {
  this.send((0, _util.format)('%d:%s', id, message));
};

Client.prototype.connect = function () {
  this.reconnect = true;
  this.socket = new WebSocketClient(this.options.url);
  this.socket.onopen = this.onConnect.bind(this);
  this.socket.onmessage = this.onMessage.bind(this);
  this.socket.onclose = this.onConnectionFailed.bind(this);
};

Client.prototype.disconnect = function () {
  if (this.open) {
    this.socket.close();
  } else {
    this.onClose();
  }
};

Client.prototype.end = function () {
  this.reconnect = false;
  this.reconnectionTimer.stop();
  this.disconnect();
};

Client.prototype.onClose = function () {
  this.connection = null;
  this.heartbeat.stop();
  if (this.reconnect !== false) this.reconnectionTimer.start();
  this.emit('close');
};

Client.prototype.setAccessToken = function (token) {
  this.accessToken = token;
  this.emit('access-token', token);
  this.connect();
};

function Heartbeat(seconds, onBeat) {
  this.count = 0;
  this.seconds = seconds;

  _events.EventEmitter.call(this);

  if (onBeat) this.on('beat', onBeat);
}

(0, _util.inherits)(Heartbeat, _events.EventEmitter);

Heartbeat.prototype.onBeat = function () {
  this.count++;
  this.timeout = setTimeout(this.onTimeout.bind(this), this.seconds * 1000 * 2);
  this.emit('beat', this.count);
};

Heartbeat.prototype.onTimeout = function () {
  this.emit('timeout');
  this.stop();
};

Heartbeat.prototype.tick = function (count) {
  if (count > 0 && typeof count === 'number') {
    this.count = count;
  }

  this.start();
};

Heartbeat.prototype.start = function () {
  this.stop();
  this.timer = setTimeout(this.onBeat.bind(this), this.seconds * 1000);
};

Heartbeat.prototype.stop = function () {
  clearTimeout(this.timer);
  clearTimeout(this.timeout);
};

function ReconnectionTimer(interval, onTripped) {
  _events.EventEmitter.call(this);

  this.started = false;

  this.interval = interval || function () {
    return 1000;
  };

  if (onTripped) this.on('tripped', onTripped);
  this.reset();
}

(0, _util.inherits)(ReconnectionTimer, _events.EventEmitter);

ReconnectionTimer.prototype.onInterval = function () {
  this.emit('tripped', this.attempt);
  this.attempt++;
};

ReconnectionTimer.prototype.start = function () {
  this.started = true;
  this.timer = setTimeout(this.onInterval.bind(this), this.interval(this.attempt));
};

ReconnectionTimer.prototype.restart = function () {
  this.reset();
  this.start();
};

ReconnectionTimer.prototype.reset = ReconnectionTimer.prototype.stop = function () {
  this.attempt = 0;
  this.started = false;
  clearTimeout(this.timer);
};