var WebSocketClient = require('websocket').client;
var util = require('util');
var format = util.format;
var EventEmitter = require('events').EventEmitter;
var Bucket = require('./bucket');
var Channel = require('./channel');
var simperiumUtil = require('./util');
var arglock = simperiumUtil.fn.arglock;

var defaultGhostStoreProvider = require('./ghost/default');
var defaultObjectStoreProvider = require('./storage/default');

module.exports = Client;

function Client(appId, accessToken, options){

  options = options || {};

  options.ghostStoreProvider = options.ghostStoreProvider || defaultGhostStoreProvider;
  options.objectStoreProvider = options.objectStoreProvider || defaultObjectStoreProvider;
  options.hearbeatInterval = options.heartbeatInterval || 4;

  this.accessToken = accessToken;

  this.options = options;

  this.heartbeat = new Heartbeat(options.hearbeatInterval, this.sendHeartbeat.bind(this));

  this.heartbeat.on('timeout', this.onConnectionTimeout.bind(this));

  this.reconnectionTimer = new ReconnectionTimer(function(attempt) {
    var time = (attempt >= 3 ? (attempt-3) * 3000 : 0) + 3000;
    return time;
  }, this.onReconnect.bind(this));

  this.appId = appId;

  options.url = options.url || format("wss://api.simperium.com/sock/1/%s/websocket", this.appId);

  this.socket = new WebSocketClient();

  this.socket.on('connectFailed', this.onConnectionFailed.bind(this));

  this.socket.on('connect', this.onConnect.bind(this));

  this.on('message:h', this.onHeartbeat.bind(this));

  this.buckets = [];

}

util.inherits(Client, EventEmitter);

Client.prototype.bucket = function(name){

  var channelId = this.buckets.length,
      bucket    = new Bucket(name, this.options.objectStoreProvider),
      channel   = new Channel(this.appId, this.accessToken, bucket, this.options.ghostStoreProvider(bucket)),
      send      = arglock(this.sendChannelMessage, channelId).bind(this),
      receive   = channel.handleMessage.bind(channel);

  this.buckets.push(bucket);

  channel.on('unauthorized', this.onUnauthorized.bind(this));
  channel.on('send', send);

  this.on('connect', channel.onConnect.bind(channel));
  this.on(format('channel:%d', channelId), receive);

  if (this.connection) channel.onConnect();

  return bucket;
};

Client.prototype.onHeartbeat = function(message){
  var counter = parseInt(message);
  this.heartbeat.tick(counter);
};

Client.prototype.onConnect = function(connection){
  this.connection = connection;
  connection.on('message', this.onMessage.bind(this));
  connection.on('close', this.onClose.bind(this));
  this.emit('connect');

  this.heartbeat.start();
  this.reconnectionTimer.reset();
};

Client.prototype.onReconnect = function(attempt) {
  this.emit('reconnect', attempt);
  this.connect();
};

Client.prototype.onConnectionTimeout = function() {
  this.disconnect();
};

Client.prototype.onConnectionFailed = function() {
  if (this.reconnect) this.reconnectionTimer.start();
};

Client.prototype.onMessage = function(message){
  this.parseMessage(message);
  this.heartbeat.tick();
};

Client.prototype.onUnauthorized = function(details) {
  this.reconnect = false;
  this.emit('unauthorized', details);
};

Client.prototype.parseMessage = function(message){

  if (message.type == 'utf8') {

    var data = message.utf8Data,
        marker = data.indexOf(":"),
        prefix = data.slice(0, marker),
        channelId = parseInt(prefix),
        channelMessage = data.slice(marker+1);

    this.emit('message', message.utf8Data);

    if (isNaN(channelId)) {
      this.emit(format("message:%s", prefix), channelMessage);
    } else {
      this.emit(format("channel:%d", channelId), channelMessage);
    }

    return;
  }

  throw new Error("Can only handle utf8 messages");

};

Client.prototype.sendHeartbeat = function(count){
  this.send(format("h:%d", count));
};

Client.prototype.send = function(data){
  this.emit('send', data);
  this.connection.sendUTF(data);
};

Client.prototype.sendChannelMessage = function(id, message){
  this.send(format("%d:%s", id, message));
};

Client.prototype.connect = function(){
  this.reconnect = true;
  this.socket.connect(this.options.url);
};

Client.prototype.disconnect = function() {
  if (this.connection) {
    this.connection.close();
  } else {
    this.onClose();
  }
};

Client.prototype.end = function() {
  this.reconnect = false;
  this.reconnectionTimer.stop();
  this.disconnect();
};

Client.prototype.onClose = function(){
  this.connection = null;
  this.heartbeat.stop();
  if (this.reconnect !== false) this.reconnectionTimer.start();
  this.emit('close');
};

function Heartbeat(seconds, onBeat) {
  this.count = 0;
  this.seconds = seconds;
  EventEmitter.call(this);

  if (onBeat) this.on('beat', onBeat);
}

util.inherits(Heartbeat, EventEmitter);

Heartbeat.prototype.onBeat = function() {
  this.count ++;

  this.timeout = setTimeout(this.onTimeout.bind(this), this.seconds * 1000 * 2);
  this.emit('beat', this.count);
};

Heartbeat.prototype.onTimeout = function() {
  this.emit('timeout');
  this.stop();
};

Heartbeat.prototype.tick = function(count) {
  if (count > 0 && typeof count == 'number') {
    this.count = count;
  }
  this.start();
};

Heartbeat.prototype.start = function() {
  this.stop();
  this.timer = setTimeout(this.onBeat.bind(this), this.seconds * 1000);
};

Heartbeat.prototype.stop = function() {
  clearTimeout(this.timer);
  clearTimeout(this.timeout);
};

function ReconnectionTimer(interval, onTripped) {

  EventEmitter.call(this);

  this.started = false;

  this.interval = interval || function(attempt) {
    return 1000;
  };

  if (onTripped) this.on('tripped', onTripped);

  this.reset();
}

util.inherits(ReconnectionTimer, EventEmitter);

ReconnectionTimer.prototype.onInterval = function() {
  this.emit('tripped', this.attempt);
  this.attempt ++;
};

ReconnectionTimer.prototype.start = function() {
  this.started = true;
  this.timer = setTimeout(this.onInterval.bind(this), this.interval(this.attempt));
};

ReconnectionTimer.prototype.restart = function () {
  this.reset();
  this.start();
};

ReconnectionTimer.prototype.reset = ReconnectionTimer.prototype.stop = function() {
  this.attempt = 0;
  this.started = false;
  clearTimeout(this.timer);
};
