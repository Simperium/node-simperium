var assert = require('assert');
var Client = require('../../lib/simperium/client');
var defaultGhostStoreProvider = require('../../lib/simperium/ghost/default');
var defaultObjectStoreProvider = require('../../lib/simperium/storage/default');
var EventEmitter = require('events').EventEmitter;
var util = require('util');

describe('Client', function() {

  var client;

  beforeEach(function() {
    client = new Client('app', {
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
    assert.equal(client.socket.connectionAttempts, 1);

  });

  it("should close when connection closes", function(done) {
    client.on('close', function() {
      done();
    });

    client.connect();

    client.connection.emit('close');

  });

  it("should send heartbeat", function() {

    client.connect();
    client.heartbeat.onBeat();

    assert.equal(client.socket.lastMessage(), 'h:1');

    client.socket.connection.emit('message', {type: 'utf8', utf8Data: 'h:2'});
    client.heartbeat.onBeat();

    assert.equal(client.socket.lastMessage(), 'h:3');

  });

  it("should configure bucket", function() {

    var bucket = client.bucket('things', 'hell-world');

    assert.equal(bucket.name, 'things');

  });

  it("should reconnect after hearbeat timeout", function() {

    client.connect();

    // two heartbeats, no message
    client.heartbeat.onTimeout();

    assert.ok(client.reconnectionTimer.started);

  });

  it("should reconnect after disconnected", function(){

    client.connect();
    client.socket.connection.emit('close');

    // The client should reconnect with a backoff algorithm
    assert.ok(client.reconnectionTimer.timer);

    client.reconnectionTimer.emit('tripped', 0);
    assert.equal(client.socket.connectionAttempts, 2);

  });

  it("should not reconnect when unauthorized", function(done) {
    var bucket = client.bucket("test", {access_token: "mock-token"}),
        unauthorized = false;

    client.on('unauthorized', function(reason) {
      unauthorized = reason;
    });

    client.on('send', function(message) {
      var channel = message.slice(0, message.indexOf(':'));
      client.emit(util.format('channel:%d', channel), 'auth:{"msg": "Error validating token", "code": 500}');
      assert.ok(!client.reconnect, "client is set to reconnect");
      process.nextTick(function() {
        client.socket.connection.emit('close');
        assert.ok(!client.reconnectionTimer.started, "Reconnection timer is running");
        assert.ok(unauthorized);
        done();        
      });
    });

    client.connect();

  });

  it("should backoff the reconnection timer", function() {

    var timer = client.reconnectionTimer;

    assert.equal(timer.interval(0), 3000);
    assert.equal(timer.interval(1), 3000);
    assert.equal(timer.interval(2), 3000);
    assert.equal(timer.interval(3), 3000);
    assert.equal(timer.interval(4), 6000);

  });

});

function MockWebSocket(socket) {
  this.connectionAttempts = 0;
  this.closeAttempts = 0;
  this.socket = socket;
  var messages = this.messages = [];

  var self = this;

  EventEmitter(this);
  var connection = this.connection = new EventEmitter();

  this.connection.sendUTF = function(message) {
    messages.push(message);
  };

  this.connection.close = function() {
    self.closeAttempts ++;
    connection.emit('close');
  };
}

util.inherits(MockWebSocket, EventEmitter);

MockWebSocket.prototype.lastMessage = function() {
  return this.messages.slice(-1)[0];
};

MockWebSocket.prototype.connect = function(uri) {
  this.connectionAttempts ++;
  this.uri = uri;
  var socket = this.socket,
      connection = this.connection;

  socket.emit('connect', connection);
};


