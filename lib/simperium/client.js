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
  options.hearbeatInterval = options.heartbeatInterval || 2;

  this.options = options;

  this.appId = appId;
  this.appSecret = appSecret;

  this.socket = new WebSocketClient();

  this.socket.on('connectFailed', function(error){
    console.log("ERROR", error);
  });

  this.socket.on('connect', this.onConnect.bind(this));

  this.heartbeat = new Heartbeat(options.hearbeatInterval, this.sendHeartbeat.bind(this));

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
  this.on('close', channel.close.bind(channel));

  // TODO: ask the bucket to find it's current cv before connecting
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

Client.prototype.onClose = function(){
  this.heartbeat.stop();
  this.emit('close');
};

function Heartbeat(seconds, onTimeout) {
  this.count = 0;
  this.seconds = seconds;
  EventEmitter(this);

  if (onTimeout) this.on('timeout', onTimeout);
}

util.inherits(Heartbeat, EventEmitter);

Heartbeat.prototype.onTimeout = function() {
  this.count ++;
  this.emit('timeout', this.count);
  this.tick();
};

Heartbeat.prototype.tick = function(count) {
  if (count > 0 && typeof count == 'number') {
    this.count = count;
  }
  this.start();
};

Heartbeat.prototype.start = function() {
  this.stop();
  this.timer = setInterval(this.onTimeout.bind(this), this.seconds * 1000);
};

Heartbeat.prototype.stop = function() {
  clearInterval(this.timer);
};