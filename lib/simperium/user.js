module.exports = User;

function User(options){
  this.options = options;
}

User.fromJSON = function(json){
  var data = JSON.parse(json);
  return new User(data);
}