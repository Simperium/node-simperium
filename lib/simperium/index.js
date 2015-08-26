var User = require('./user');
var Client = require('./client');
var Auth = require('./auth');

module.exports = function(appId, token, options) {
  return new Client(appId, token, options);
};

module.exports.Auth = Auth;
module.exports.User = User;
module.exports.Client = Client;
