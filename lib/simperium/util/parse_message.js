"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = _default;

function _default(data) {
  var marker = data.indexOf(':');
  return {
    command: data.slice(0, marker),
    data: data.slice(marker + 1)
  };
}