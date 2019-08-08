"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
Object.defineProperty(exports, "parseMessage", {
  enumerable: true,
  get: function get() {
    return _parse_message.default;
  }
});
Object.defineProperty(exports, "parseVersionMessage", {
  enumerable: true,
  get: function get() {
    return _parse_version_message.default;
  }
});
exports.change = void 0;

var change = _interopRequireWildcard(require("./change"));

exports.change = change;

var _parse_message = _interopRequireDefault(require("./parse_message"));

var _parse_version_message = _interopRequireDefault(require("./parse_version_message"));

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } else { var newObj = {}; if (obj != null) { for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) { var desc = Object.defineProperty && Object.getOwnPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : {}; if (desc.get || desc.set) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } } newObj.default = obj; return newObj; } }