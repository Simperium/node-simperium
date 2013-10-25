var uuid = require('node-uuid');
var jsondiff = require('../jsondiff')();

var changeTypes = {
  MODIFY: 'M',
  REMOVE: '-',
  ADD: '+'
}

module.exports = {
  type: changeTypes,
  buildChange: buildChange
}

function buildChange(type, id, object, ghost){

  var target = object
    , origin = ghost.data
    , changeData = {
        o: type,
        id: id,
        ccid: uuid.v4()
      };

  // Remove operations have no source version or diff
  if (type == changeTypes.REMOVE) return changeData;

  if (ghost.version > 0) changeData.sv = ghost.version;

  changeData.v = jsondiff.object_diff(origin, target);

  return changeData;
}

function compressChanges(changes, origin){

  var compressed = changes.forEach(function(from, change){
    // deletes when, any changes after a delete are ignored
    if (from.o == changeTypes.REMOVE) return from;
    return jsondiff.apply_object_diff(origin, change.v);
  });

}