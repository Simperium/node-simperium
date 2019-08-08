"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = _default;

var _websocket = require("websocket");

var _http = _interopRequireDefault(require("http"));

var _util = require("util");

var _events = require("events");

var _util2 = require("./util");

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var datasource = new DataSource();

function _default() {
  var server = _http.default.createServer(function (req, res) {
    console.log('Received request for', +req.url);
    res.writeHead(404);
    res.end();
  });

  var socketServer = new _websocket.server({
    httpServer: server,
    autoAcceptConnections: true
  });
  socketServer.on('request', function (request) {
    console.log('Accept request?', request);
  }).on('connect', function () {
    // var bucket = new Session( connection );
    console.log('Connected');
  });
  return server;
}

;

function Session(connection) {
  this.connection = connection.on('message', this.onMessage.bind(this));
  this.channels = {};
}

(0, _util.inherits)(Session, _events.EventEmitter);

Session.prototype.onMessage = function (msg) {
  var message = (0, _util2.parseMessage)(msg.utf8Data),
      channelId = message.command,
      channel,
      i;

  if (channelId === 'h') {
    i = parseInt(message.data);
    if (isNaN(i)) i = 0;
    this.connection.send((0, _util.format)('h:%d', i + 1));
    return;
  }

  channelId = parseInt(channelId); // build a channel if we don't have one for the requested channel

  channel = this.getChannel(channelId);
  channel.handleMessage(message.data);
};

Session.prototype.getChannel = function (id) {
  var channel = this.channels[id],
      connection;

  if (!channel) {
    connection = this.connection;
    channel = new Channel(id);
    this.channels[id] = channel;
    channel.on('send', function (data) {
      connection.send((0, _util.format)('%d:%s', id, data));
    }).on('unauthorized', function () {
      connection.send((0, _util.format)('%d:auth:%s', id, JSON.stringify({
        code: 500
      })));
      connection.close();
    });
  }

  return channel;
};

function Channel(id, settings) {
  this.settings = settings || {};
  this.settings.bucketAdapter = this.settings.bucketAdapter || defaultBucketAdapter;
  this.id = id;
  this.messages = new _events.EventEmitter();
  this.messages.on('init', this.init.bind(this));
}

(0, _util.inherits)(Channel, _events.EventEmitter);

Channel.prototype.handleMessage = function (data) {
  var message = (0, _util2.parseMessage)(data);
  this.messages.emit(message.command, message.data);
};

Channel.prototype.init = function (data) {
  var options = JSON.parse(data),
      name = options.name,
      token = options.token,
      emit = this.emit.bind(this); // TODO: look up the bucket data source
  // TODO: validate token for bucket

  console.log('Time to init', options, name, token);
  this.bucket = this.settings.bucketAdapter();
  this.bucket.initialize(options, function (e, user) {
    if (e) return emit('unauthorized', e);
    emit('send', (0, _util.format)('auth:%s', user.email));
  });
};

function defaultBucketAdapter() {
  return new MemoryBucket(datasource);
}

function MemoryBucket(ds) {
  this.dataSource = ds;
}

MemoryBucket.prototype.initialize = function (settings, callback) {
  console.log('Validate intiailization parameters', settings);
  this.dataSource.authorize(settings.token, function (e, user) {
    callback(e, user);
  });
};

function DataSource() {
  this.tokens = {
    'access-token': {
      email: 'email@example.com'
    }
  };
}

DataSource.prototype.authorize = function (token, callback) {
  var user = this.tokens[token];

  if (user) {
    callback(null, user);
  } else {
    callback(new Error('User not authorized'));
  }
};