var EventEmitter = require('events').EventEmitter;
var User = require('./user');
var util = require('util');
var format = util.format;
var https = require('https');
var url = require('url');

var URL = "https://auth.simperium.com/1";

module.exports = Auth;

function Auth(appId, appSecret){
  this.appId = appId;
  this.appSecret = appSecret;
}

util.inherits(Auth, EventEmitter);

Auth.prototype.onResponse = function(res){

  var success = this.onUser.bind(this)
    , responseData = "";

  res.on('data', function(data){
    responseData += data.toString();
  });

  res.on('end', function(){
    success(User.fromJSON(responseData));
  });

}

Auth.prototype.onUser = function(user){
  this.emit('authorize', user);
}

Auth.prototype.authorize = function(username, password){

  var body = JSON.stringify({username:username, password:password})
    , req  = this.request("authorize/", body);

  return req;
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
  var handler = this.onResponse.bind(this),
      req = https.request(this.getUrlOptions(endpoint), handler);

  console.log("Sending body", data, arguments);
  req.end(data);
}