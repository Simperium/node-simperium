var EventEmitter = require('events').EventEmitter;
var User = require('./user');
var util = require('util');
var format = util.format;
var https = require('https');
var url = require('url');
var defer = require('node-promise').defer;
var arglock = require('./util/fn').arglock;

var URL = "https://auth.simperium.com/1";

module.exports = Auth;

function Auth(appId, appSecret){
  this.appId = appId;
  this.appSecret = appSecret;
}

util.inherits(Auth, EventEmitter);

Auth.prototype.onResponse = function(promise, res){

  var success = this.onUser.bind(this)
    , responseData = "";

  res.on('data', function(data){
    responseData += data.toString();
  });

  res.on('end', function(){
    success(User.fromJSON(responseData), promise);
  });

}

Auth.prototype.onUser = function(user, promise){
  this.emit('authorize', user);
  promise.resolve(user);
}

Auth.prototype.authorize = function(username, password){

  var body = JSON.stringify({username:username, password:password})
    , deffered = this.request("authorize/", body);

  return deffered;
}

Auth.prototype.create = function(username, password){

}

Auth.prototype.getUrlOptions = function(path){
  var options = url.parse(format("%s/%s/%s", URL, this.appId, path));
  options.method = "POST";
  options.headers = { "X-Simperium-API-Key" : this.appSecret };
  return options;
}

Auth.prototype.request = function(endpoint, data){
  var deferred = defer()
    , handler = arglock(this.onResponse, deferred).bind(this)
    , req = https.request(this.getUrlOptions(endpoint), handler);

  req.on('error', function(e) {
    deferred.reject(e);
  });

  req.end(data);
  return deferred;
}