var WebSocketClient = require('websocket').client;
var util = require('util');
var format = util.format;
var EventEmitter = require('events').EventEmitter;
var Auth = require('./auth');
var Bucket = require('./bucket');
var Channel = require('./channel');
var simperiumUtil = require('./util');
var arglock = simperiumUtil.fn.arglock;

var defaultGhostStoreProvider = require('./ghost/default');
var defaultObjectStoreProvider = require('./storage/default');

module.exports = Client;

function Client(appId, appSecret, options){

  options = options || {};

  options.ghostStoreProvider = options.ghostStoreProvider || defaultGhostStoreProvider;
  options.objectStoreProvider = options.objectStoreProvider || defaultObjectStoreProvider;
  options.hearbeatInterval = options.heartbeatInterval || 2000;

  this.options = options;

  this.heartbeat = new Heartbeat(options.hearbeatInterval, this.sendHeartbeat.bind(this));

  this.heartbeat.on('timeout', this.onConnectionTimeout.bind(this));

  this.reconnectionTimer = new ReconnectionTimer(function(attempt) {
    return (attempt >= 3 ? (attempt-3) * 3000 : 0) + 3000;
  }, this.onReconnect.bind(this));

  this.appId = appId;
  this.appSecret = appSecret;

  this.socket = new WebSocketClient();

  this.socket.on('connectFailed', function(error){
    console.error("ERROR", error);
  });

  this.socket.on('connect', this.onConnect.bind(this));

  this.on('message:h', this.onHeartbeat.bind(this));

  this.users = new Auth(appId, appSecret);

  this.buckets = [];

}

util.inherits(Client, EventEmitter);

Client.prototype.bucket = function(name, user){

  var channelId = this.buckets.length,
      channel   = new Channel(this, name, user.access_token),
      bucket    = new Bucket(name, user, channel, this.options),
      send      = arglock(this.sendChannelMessage, channelId).bind(this),
      receive   = channel.handleMessage.bind(channel);

  this.buckets.push(bucket);

  channel.on('send', send);
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

Client.prototype.onMessage = function(message){
  this.parseMessage(message);
  this.heartbeat.tick();
};

Client.prototype.parseMessage = function(message){

  if (message.type == 'utf8') {

    var data = message.utf8Data,
        marker = data.indexOf(":"),
        prefix = data.slice(0, marker),
        channelId = parseInt(prefix),
        channelMessage = data.slice(marker+1);

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
  this.connection.sendUTF(format("h:%d", count));
};

Client.prototype.send = function(data){
  this.connection.sendUTF(data);
  this.heartbeat.tick();
};

Client.prototype.sendChannelMessage = function(id, message){
  this.send(format("%d:%s", id, message));
};

Client.prototype.connect = function(){
  this.socket.connect(format("wss://api.simperium.com/sock/1/%s/websocket", this.appId));
};

Client.prototype.disconnect = function() {
  if (this.connection) {
    this.connection.close();
  } else {
    this.onClose();
  }
};

Client.prototype.onClose = function(){
  this.connection = null;
  this.heartbeat.stop();
  this.reconnectionTimer.start();
  this.emit('close');
};

function Heartbeat(seconds, onBeat) {
  this.count = 0;
  this.seconds = seconds;
  EventEmitter(this);

  if (onBeat) this.on('beat', onBeat);
}

util.inherits(Heartbeat, EventEmitter);

Heartbeat.prototype.onBeat = function() {
  this.count ++;

  this.timeout = setInterval(this.onTimeout.bind(this), this.seconds * 1000);
  this.emit('beat', this.count);
  this.tick();
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
  this.timer = setInterval(this.onBeat.bind(this), this.seconds * 1000);
};

Heartbeat.prototype.stop = function() {
  clearInterval(this.timer);  
  clearInterval(this.timeout);
};

function ReconnectionTimer(interval, onTripped) {

  EventEmitter(this);

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
};

ReconnectionTimer.prototype.start = function() {
  this.started = true;
  this.timer = setInterval(this.onInterval.bind(this), this.interval(this.attempt));
};

ReconnectionTimer.prototype.restart = function () {
  this.reset();
  this.start();
};

ReconnectionTimer.prototype.reset = ReconnectionTimer.prototype.stop = function() {
  this.attempt = 0;
  this.started = false;
  clearInterval(this.timer);
};