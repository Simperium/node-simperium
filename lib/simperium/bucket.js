var util = require('util');
var EventEmitter = require('events').EventEmitter;
var format = util.format;
var uuid = require('node-uuid');

var arglock = require('./util/fn').arglock;

module.exports = Bucket;

function Bucket(name, storeProvider) {
  EventEmitter.call(this);
  this.name = name;
  this.store = storeProvider(this);
}

util.inherits(Bucket, EventEmitter);

Bucket.prototype.add = function(object, callback){
  var id = uuid.v4();
  return this.update(id, object, callback);
};

Bucket.prototype.get = function(id, callback) {
  return this.store.get(id, callback);
};

Bucket.prototype.update = function(id, object, callback){
  // needs to be updated
  var self = this;
  return this.store.update(id, object, function(err, id, object) {
    callback(err, id, object);
  });
};


Bucket.prototype.remove = function(id, callback) {
  var self = this;
  return this.store.remove(id, function(err, id) {
    callback(err, id);
  });
};
