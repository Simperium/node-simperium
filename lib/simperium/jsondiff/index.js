"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;

var _jsondiff = require("./jsondiff");

var jsondiff = new _jsondiff.JSONDiff({
  list_diff: false
});
exports.default = jsondiff;