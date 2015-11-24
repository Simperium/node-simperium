var WebSocketServer = require('websocket').server,
    http = require('http'),
    util = require('util'),
    events = require('events'),
    simperiumUtil = require('./util');

module.exports = function() {
  var server = http.createServer(function(req, res) {
    console.log("Received request for", + req.url);
    response.writeHead(404);
    response.end();
  });
  var socketServer = new WebSocketServer({
    httpServer: server,
    autoAcceptConnections: true
  });

  socketServer
  .on('request', function(request) {
    console.log("Accept request?", request);
  })
  .on('connect', function(connection) {
    console.log("Connected");
    var bucket = new Session(connection);
  });

  return server;
};


function Session(connection) {
  this.connection = connection.on('message', this.onMessage.bind(this));
  this.channels = {};
}

util.inherits(Session, events.EventEmitter);

Session.prototype.onMessage = function(msg) {
  var message = simperiumUtil.parseMessage(msg.utf8Data),
      channelId = message.command;

  if (channelId == 'h') {
    var i = parseInt(message.data);
    if (isNaN(i)) i = 0;
    this.connection.send(util.format('h:%d', i+1));
    return;
  }

  channelId = parseInt(channelId);

  // build a channel if we don't have one for the requested channel
  var channel = this.getChannel(channelId);

  channel.handleMessage(message.data);

};

Session.prototype.getChannel = function(id) {
  var channel = this.channels[id];

  if (!channel) {
    var connection = this.connection;
    channel = new Channel(id);
    this.channels[id] = channel;
    channel
    .on('send', function(data) {
      connection.send(util.format("%d:%s", id, data));
    })
    .on('unauthorized', function(e) {
      connection.send(util.format("%d:auth:%s", id, JSON.stringify({code: 500})));
      connection.close();
    });
  }

  return channel;

};

function Channel(id, settings) {
  this.settings = settings || {};

  this.settings.bucketAdapter = this.settings.bucketAdapter || defaultBucketAdapter;

  this.id = id;
  this.messages = new events.EventEmitter();

  this.messages.on('init', this.init.bind(this));
}

util.inherits(Channel, events.EventEmitter);

Channel.prototype.handleMessage = function(data) {
  var message = simperiumUtil.parseMessage(data);
  this.messages.emit(message.command, message.data);
};

Channel.prototype.init = function(data) {
  var options = JSON.parse(data),
      name    = options.name,
      token   = options.token,
      emit    = this.emit.bind(this);

  // TODO: look up the bucket data source
  // TODO: validate token for bucket

  console.log("Time to init", options);
  this.bucket = this.settings.bucketAdapter();

  this.bucket.initialize(options, function(e, user) {
    if (e) return emit('unauthorized', e);
    emit('send', util.format('auth:%s', user.email));
  });

};


function defaultBucketAdapter() {
  return new MemoryBucket(datasource);
}

function MemoryBucket(ds) {
  this.dataSource = ds;
}

MemoryBucket.prototype.initialize = function(settings, callback) {
  console.log("Validate intiailization parameters", settings);
  this.dataSource.authorize(settings.token, function(e, user) {
    callback(e, user);
  });
};

var datasource = new DataSource();

function DataSource() {
  this.tokens = {
    "access-token": {
      email: "beaucollins@gmail.com"
    }
  };
}

DataSource.prototype.authorize = function(token, callback) {
  var user = this.tokens[token];
  if (user) {
    callback(null, user);
  } else {
    callback(new Error("User not authorized"));    
  }
};