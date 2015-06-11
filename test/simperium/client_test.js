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

});

function MockWebSocket(socket) {
  this.socket = socket;

  EventEmitter(this);
  this.connection = new EventEmitter();
}

util.inherits(MockWebSocket, EventEmitter);

MockWebSocket.prototype.connect = function(uri) {
  this.uri = uri;
  var socket = this.socket,
  connection = this.connection;
  socket.emit('connect', connection);
};

