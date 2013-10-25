
var Store = require('./store');

module.exports = function(user, bucket){
  return new Store(user, bucket);
}

