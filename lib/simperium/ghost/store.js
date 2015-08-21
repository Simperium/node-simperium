var Promise = require("promise");

module.exports = Store;

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

  return promise;
};

Store.prototype.setChangeVersion = function(cv){
  var self = this,
      promise = new Promise(function(resolve, reject) {
        process.nextTick(function() {
          self.cv = cv;
          resolve(cv);
        });
      });

  return promise;
};

Store.prototype.put = function(id, version, data){
  var self = this,
      promise = new Promise(function(resolve, reject) {
        process.nextTick(function(){
          self.index[id] = JSON.stringify({version:version, data:data});
          resolve(true);
        });
      });
  return promise;
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

  return promise;
};

Store.prototype.remove = function(id) {
  var self = this;
      promise = new Promise(function(resolve, reject) {
        process.nextTick(function() {
          delete self.index[id];
          resolve();
        });
      });

  return promise;

};