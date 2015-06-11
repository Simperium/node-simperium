var assert = require('assert');
var Client = require('../../lib/simperium/client');
var defaultGhostStoreProvider = require('../../lib/simperium/ghost/default');
var defaultObjectStoreProvider = require('../../lib/simperium/storage/default');
var EventEmitter = require('events').EventEmitter;
var util = require('util');

describe('Client', function() {

  var client;

  beforeEach(function() {
    client = new Client('app', 'secret', {
        ghostStoreProvider: defaultGhostStoreProvider,
        objectStoreProvider: defaultObjectStoreProvider
    });

    client.socket = new MockWebSocket(client.socket);

  });

  it("should connect", function(done) {

    client.on('connect', function() {
      done();
    });

    client.connect();

    assert.equal('wss://api.simperium.com/sock/1/app/websocket', client.socket.uri);

  });

  it("should close when connection closes", function(done) {
    client.on('close', function() {
      done();
    });

    client.connect();

    client.connection.emit('close');

  });

  it("should send heartbeat after timeout", function() {

    client.connect();
    client.heartbeat.onTimeout();

    assert.equal(client.socket.lastMessage(), 'h:1');

    client.socket.connection.emit('message', {type: 'utf8', utf8Data: 'h:2'});
    client.heartbeat.onTimeout();

    assert.equal(client.socket.lastMessage(), 'h:3');

  });

});

function MockWebSocket(socket) {
  this.socket = socket;
  var messages = this.messages = [];
  EventEmitter(this);
  this.connection = new EventEmitter();

  this.connection.sendUTF = function(message) {
    messages.push(message);
  };
}

util.inherits(MockWebSocket, EventEmitter);

MockWebSocket.prototype.lastMessage = function() {
  return this.messages.slice(-1)[0];
};

MockWebSocket.prototype.connect = function(uri) {
  this.uri = uri;
  var socket = this.socket,
  connection = this.connection;
  socket.emit('connect', connection);
};


