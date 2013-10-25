var jsondiff = require('./jsondiff');
var diff_match_patch = require('./diff_match_patch');

module.exports = init;

module.exports.jsondiff = jsondiff;
module.exports.diff_match_patch = diff_match_patch;

function init(){
  return new jsondiff;
}