module.exports = function(data){
  var marker  = data.indexOf(':');

  return {
    command: data.slice(0, marker),
    data: data.slice(marker+1)
  }
}