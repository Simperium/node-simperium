var util = require('util');
var format = util.format;
var EventEmitter = require('events').EventEmitter;
var simperiumUtil = require('./util')
var arglock = simperiumUtil.fn.arglock;
var parseMessage = simperiumUtil.parseMessage;

module.exports = Channel;

function Channel(id, client, name, access_token){
  this.id = id;
  this.client = client;
  this.name = name;
  this.access_token = access_token;

  client.on('connect', this.onConnect.bind(this));
  client.on(format("channel:%d", id), this.handleMessage.bind(this));

  this.on('auth', this.onAuth.bind(this));
  this.on('i', this.onIndex.bind(this));
  this.on('c', this.onChanges.bind(this));
  this.on('e', this.onVersion.bind(this));
  this.on('o', console.log);
}

util.inherits(Channel, EventEmitter);

Channel.prototype.handleMessage = function(data){

  var message = parseMessage(data);

  console.log("%d <= %s", this.id, message.command);

  this.emit(message.command, message.data);
}

Channel.prototype.send = function(data){
  this.client.send(format("%d:%s", this.id, data));
}

Channel.prototype.onAuth = function(data){
  this.sendIndexRequest();
}

Channel.prototype.onConnect = function(){
  var init = {
      name: this.name
    , clientId: 'node-simperium-0.0.1'
    , api: 1
    , token: this.access_token
    , app_id: this.client.appId
    , library: 'node-simperium'
    , version: 0
  };

  this.send(format("init:%s", JSON.stringify(init)));
}

Channel.prototype.onIndex = function(data){

  var page    = JSON.parse(data)
    , objects = page.index
    , mark    = page.mark
    , cv      = page.current
    , emit    = arglock(this.emit, 'version').bind(this);

  if (mark != null) this.sendIndexRequest(mark);

  objects.forEach(function(object, i){
    emit(object.id, object.v, object.d);
  });

  if (!mark || mark == undefined) this.emit('index');

}

Channel.prototype.sendIndexRequest = function (mark){
  this.send(format("i:1:%s::10", mark ? mark : ''));
}

Channel.prototype.onChanges = function(data){

  var changes = JSON.parse(data)
    , emit = arglock(this.emit, 'change').bind(this);

  changes.forEach(function(change){
    emit(change.id, change);
  });

}

Channel.prototype.onVersion = function(data){
  var dataMark = data.indexOf("\n")
    , versionMark = data.indexOf('.')
    , id = data.slice(0, versionMark)
    , version = parseInt(data.slice(versionMark+1, dataMark))
    , payload = JSON.parse(data.slice(dataMark+1));

    this.emit('version', id, version, payload.data);
}
