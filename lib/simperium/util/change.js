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
  
  if (changes.length === 0) {
    return {};
  }

  if (changes.length === 1) {
    return changes[0].v;
  }

  var modified = changes.reduce(function(from, change){
    // deletes when, any changes after a delete are ignored
    if (from === null) return null;
    if (from.o == changeTypes.REMOVE) return null;
    return jsondiff.apply_object_diff(from, change.v);
  }, origin);

  if (modified === null) return null;

  return jsondiff.object_diff(origin, modified);

}

function rebase(local_diff, remote_diff, origin) {
  return jsondiff.transform_object_diff(local_diff, remote_diff, origin);
}