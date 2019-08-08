"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = _default;
Object.defineProperty(exports, "Client", {
  enumerable: true,
  get: function get() {
    return _client.default;
  }
});
Object.defineProperty(exports, "Auth", {
  enumerable: true,
  get: function get() {
    return _auth.default;
  }
});
exports.util = void 0;

var _client = _interopRequireDefault(require("./client"));

var _auth = _interopRequireDefault(require("./auth"));

var util = _interopRequireWildcard(require("./util"));

exports.util = util;

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } else { var newObj = {}; if (obj != null) { for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) { var desc = Object.defineProperty && Object.getOwnPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : {}; if (desc.get || desc.set) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } } newObj.default = obj; return newObj; } }

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _default(appId, token, options) {
  return new _client.default(appId, token, options);
}