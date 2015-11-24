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
  this.isIndexing = false;
}

util.inherits(Bucket, EventEmitter);

Bucket.prototype.reload = function() {
  this.emit('reload');
};

Bucket.prototype.add = function(object, callback){
  var id = uuid.v4();
  return this.update(id, object, callback);
};

Bucket.prototype.get = function(id, callback) {
  return this.store.get(id, callback);
};

Bucket.prototype.update = function(id, data, options, callback){
	if (typeof options === 'function') {
		callback = options;
	}
  return this.store.update(id, data, callback);
};

Bucket.prototype.touch = function (id, callback) {
	var self = this;
	return this.store.get(id, function(e, object) {
		if (e) return callback(e);
		self.update(object.id, object.data, callback);
	});
};

Bucket.prototype.remove = function(id, callback) {
  var self = this;
  return this.store.remove(id, callback);
};

Bucket.prototype.find = function(query, callback) {
  return this.store.find(query, callback);
};

Bucket.prototype.getRevisions = function(id, callback) {
  // Overridden in Channel
}
