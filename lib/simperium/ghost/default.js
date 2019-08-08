"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = _default;

var _store = _interopRequireDefault(require("./store"));

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

/**
 * In memory implementation of a ghostStoreProvider
 *
 * @param {Bucket} a bucket instance to store ghost objects for
 * @returns {GhostStore} an istance of a GhostStore used to save Ghost data
 */
function _default(bucket) {
  return new _store.default(bucket);
}

;