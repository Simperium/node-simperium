var Promise = require("promise");

module.exports = Store;

function log_error() {
  return function(e) {
    console.error(e);
  };
}

function Store(bucket){
  this.bucket = bucket;
  this.index = {};
}

Store.prototype.getChangeVersion = function(){
  var self = this,
      promise = new Promise(function(resolve, reject) {
        process.nextTick(function() {
          resolve(self.cv);
        });
      });

  return promise.catch(log_error);
};

Store.prototype.setChangeVersion = function(cv){
  var self = this,
      promise = new Promise(function(resolve, reject) {
        process.nextTick(function() {
          self.cv = cv;
          resolve(cv);
        });
      });

  return promise.catch(log_error);
};

Store.prototype.put = function(id, version, data){
  var self = this,
      promise = new Promise(function(resolve, reject) {
        process.nextTick(function(){
          self.index[id] = JSON.stringify({version:version, data:data});
          resolve(true);
        });
      });
  return promise.catch(log_error);
};

Store.prototype.get = function(id){
  var self = this;
      promise = new Promise(function(resolve, reject) {
        process.nextTick(function() {
          var ghost = self.index[id];
          if (!ghost){
            ghost = {data:{}};
            self.index[id] = JSON.stringify(ghost);
          } else {
            ghost = JSON.parse(ghost);
          }
          resolve(ghost);
        });
      });

  return promise.catch(log_error);
};

Store.prototype.remove = function(id) {
  var self = this;
      promise = new Promise(function(resolve, reject) {
        process.nextTick(function() {
          delete self.index[id];
          resolve();
        });
      });

  return promise.catch(log_error);

};