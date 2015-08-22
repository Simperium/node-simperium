var EventEmitter = require('events').EventEmitter;
var User = require('./user');
var util = require('util');
var format = util.format;
var https = require('https');
var url = require('url');
var Promise = require('promise');
var arglock = require('./util/fn').arglock;

var URL = "https://auth.simperium.com/1";

module.exports = Auth;

function Auth(appId, appSecret){
  this.appId = appId;
  this.appSecret = appSecret;
}

util.inherits(Auth, EventEmitter);

Auth.prototype.authorize = function(username, password){

  var body = JSON.stringify({username:username, password:password})
    , promise = this.request("authorize/", body);

  return promise;
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
  var self = this,
      promise = new Promise(function(resolve, reject) {
        var req = https.request(self.getUrlOptions(endpoint), function(res) {
              var responseData = "";

              res.on('data', function(data){
                responseData += data.toString();
              });

              res.on('end', function(){
                var user = User.fromJSON(responseData);
                self.emit('authorize', user);
                resolve(user);
              });
            });

        req.on('error', function(e){
          reject(e);
        });

        req.end(data);
    
      });

  return promise;;
}