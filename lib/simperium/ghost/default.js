
var Store = require('./store');

module.exports = function(bucket){
  return new Store(bucket);
}

