var User = require('./user');
var Client = require('./client');
var Auth = require('./auth');

module.exports = function(appId, options) {
  return new Client(appId, options);
};

module.exports.Auth = Auth;
module.exports.User = User;
module.exports.Client = Client;
