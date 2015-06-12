var defer = require('node-promise').defer;

module.exports = function(user, bucket){
  return new BucketStore();
};

function BucketStore() {
  this.objects = {};
}

BucketStore.prototype.get = function(id, callback) {
  var objects = this.objects;
  process.nextTick(function() {
    callback(null, id, objects[id]);    
  });
};

BucketStore.prototype.update = function(id, object, callback) {
  this.objects[id] = object;
  process.nextTick(function() {
    callback(null, id, object);    
  });
};

BucketStore.prototype.remove = function(id, callback) {
  delete this.objects[id];
  process.nextTick(function() {
    callback(null, id);    
  });
};