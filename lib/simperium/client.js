var WebSocketClient = require('websocket').client;
var util = require('util');
var format = util.format;
var EventEmitter = require('events').EventEmitter;
var Auth = require('./auth');

module.exports = Client;

function Client(appId, appSecret){
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
}

util.inherits(Client, EventEmitter);

Client.prototype.onHeartbeat = function(message){
  var counter = parseInt(message);
  if (counter != NaN) this.heartbeatCount = counter;
}

Client.prototype.onConnect = function(connection){
  this.connection = connection;
  connection.on('message', this.onMessage.bind(this));
  this.scheduleHeartbeat();
}

Client.prototype.onMessage = function(message){
  this.parseMessage(message);
  this.scheduleHeartbeat();
}

Client.prototype.parseMessage = function(message){

  if (message.type == 'utf8') {
    // if it's prefixed with an int, it's a channel message
    var data = message.utf8Data,
      marker = data.indexOf(":");
    prefix = data.slice(0, marker);

    this.emit(format("message:%s", prefix), data.slice(marker+1));

    // it it's an h: it's a heartbeat message
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
  console.log("Sending heartbeat: %d", this.heartbeatCount);
  this.connection.sendUTF(format("h:%d", this.heartbeatCount));
  this.scheduleHeartbeat();
}

Client.prototype.connect = function(){
  this.socket.connect(format("wss://api.simperium.com/sock/1/%s/websocket", this.appId));
}
