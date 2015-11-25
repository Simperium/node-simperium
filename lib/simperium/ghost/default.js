import Store from './store'

module.exports = function(bucket){
  return new Store(bucket);
}

