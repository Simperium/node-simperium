var defer = require("node-promise").defer;

module.exports = Store;

function Store(user, bucket){
  this.user = user;
  this.bucket = bucket;

  this.index = {};

}

Store.prototype.getChangeVersion = function(){
  var deferred = defer();

  return deferred.promise;
}

Store.prototype.setChangeVersion = function(cv){
  var deferred = defer();

  return deferred.promise;
}

Store.prototype.put = function(id, version, data){
  var deferred = defer()
    , args = [].slice.apply(arguments);

  this.index[id] = JSON.stringify({version:version, data:data});

  process.nextTick(function(){
    deferred.resolve(true);
  });

  return deferred.promise;
}

Store.prototype.get = function(id){
  var deferred = defer(),
      ghost = this.index[id];

  if (!ghost){
    ghost = {version:0, data:{}};
    this.index[id] = JSON.stringify(ghost);
  } else {
    ghost = JSON.parse(ghost);
  }

  process.nextTick(function(){
    deferred.resolve(ghost);
  });

  return deferred.promise;
}