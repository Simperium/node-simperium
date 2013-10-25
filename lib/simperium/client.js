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

  this.options = options;

  this.appId = appId;
  this.appSecret = appSecret;

  this.socket = new WebSocketClient;

  this.socket.on('connectFailed', function(error){
    console.log("ERROR", error);
  });

  this.socket.on('connect', this.onConnect.bind(this));

  this.heartbeatCount = 0;

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
}

Client.prototype.onHeartbeat = function(message){
  var counter = parseInt(message);
  if (counter != NaN) this.heartbeatCount = counter;
}

Client.prototype.onConnect = function(connection){
  this.connection = connection;
  connection.on('message', this.onMessage.bind(this));
  connection.on('close', this.onClose.bind(this));
  this.scheduleHeartbeat();
  this.emit('connect');
}

Client.prototype.onMessage = function(message){
  this.parseMessage(message);
  this.scheduleHeartbeat();
}

Client.prototype.parseMessage = function(message){

  if (message.type == 'utf8') {

    var data = message.utf8Data
      , marker = data.indexOf(":")
      , prefix = data.slice(0, marker)
      , channelId = parseInt(prefix)
      , message = data.slice(marker+1);

    if (channelId == NaN) {
      this.emit(format("message:%s", prefix), message);
    } else {
      this.emit(format("channel:%d", channelId), message);
    }

    return;

  }

  throw new Error("Can only handle utf8 messages");

}

Client.prototype.scheduleHeartbeat = function(){
  clearTimeout(this.heartbeatTimer);
  this.heartbeatTimer = setTimeout(this.sendHeartbeat.bind(this), 20000);
}

Client.prototype.sendHeartbeat = function(){
  this.heartbeatCount ++;
  this.connection.sendUTF(format("h:%d", this.heartbeatCount));
  this.scheduleHeartbeat();
}

Client.prototype.send = function(data){
  this.connection.sendUTF(data);
  this.scheduleHeartbeat();
}

Client.prototype.sendChannelMessage = function(id, message){
  this.send(format("%d:%s", id, message));
}

Client.prototype.connect = function(){
  this.socket.connect(format("wss://api.simperium.com/sock/1/%s/websocket", this.appId));
}

Client.prototype.onClose = function(){
  // we're going to need to notify all channels that they're closed
  console.log("We've been closed");
}
