"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = exports.Auth = exports.AuthError = void 0;

var _events = _interopRequireDefault(require("events"));

var _https = require("https");

var _url = _interopRequireDefault(require("url"));

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _typeof(obj) { if (typeof Symbol === "function" && typeof Symbol.iterator === "symbol") { _typeof = function _typeof(obj) { return typeof obj; }; } else { _typeof = function _typeof(obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; }; } return _typeof(obj); }

function ownKeys(object, enumerableOnly) { var keys = Object.keys(object); if (Object.getOwnPropertySymbols) { var symbols = Object.getOwnPropertySymbols(object); if (enumerableOnly) symbols = symbols.filter(function (sym) { return Object.getOwnPropertyDescriptor(object, sym).enumerable; }); keys.push.apply(keys, symbols); } return keys; }

function _objectSpread(target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i] != null ? arguments[i] : {}; if (i % 2) { ownKeys(source, true).forEach(function (key) { _defineProperty(target, key, source[key]); }); } else if (Object.getOwnPropertyDescriptors) { Object.defineProperties(target, Object.getOwnPropertyDescriptors(source)); } else { ownKeys(source).forEach(function (key) { Object.defineProperty(target, key, Object.getOwnPropertyDescriptor(source, key)); }); } } return target; }

function _defineProperty(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }

function _defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } }

function _createClass(Constructor, protoProps, staticProps) { if (protoProps) _defineProperties(Constructor.prototype, protoProps); if (staticProps) _defineProperties(Constructor, staticProps); return Constructor; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (call && (_typeof(call) === "object" || typeof call === "function")) { return call; } return _assertThisInitialized(self); }

function _assertThisInitialized(self) { if (self === void 0) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function"); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, writable: true, configurable: true } }); if (superClass) _setPrototypeOf(subClass, superClass); }

function _wrapNativeSuper(Class) { var _cache = typeof Map === "function" ? new Map() : undefined; _wrapNativeSuper = function _wrapNativeSuper(Class) { if (Class === null || !_isNativeFunction(Class)) return Class; if (typeof Class !== "function") { throw new TypeError("Super expression must either be null or a function"); } if (typeof _cache !== "undefined") { if (_cache.has(Class)) return _cache.get(Class); _cache.set(Class, Wrapper); } function Wrapper() { return _construct(Class, arguments, _getPrototypeOf(this).constructor); } Wrapper.prototype = Object.create(Class.prototype, { constructor: { value: Wrapper, enumerable: false, writable: true, configurable: true } }); return _setPrototypeOf(Wrapper, Class); }; return _wrapNativeSuper(Class); }

function isNativeReflectConstruct() { if (typeof Reflect === "undefined" || !Reflect.construct) return false; if (Reflect.construct.sham) return false; if (typeof Proxy === "function") return true; try { Date.prototype.toString.call(Reflect.construct(Date, [], function () {})); return true; } catch (e) { return false; } }

function _construct(Parent, args, Class) { if (isNativeReflectConstruct()) { _construct = Reflect.construct; } else { _construct = function _construct(Parent, args, Class) { var a = [null]; a.push.apply(a, args); var Constructor = Function.bind.apply(Parent, a); var instance = new Constructor(); if (Class) _setPrototypeOf(instance, Class.prototype); return instance; }; } return _construct.apply(null, arguments); }

function _isNativeFunction(fn) { return Function.toString.call(fn).indexOf("[native code]") !== -1; }

function _setPrototypeOf(o, p) { _setPrototypeOf = Object.setPrototypeOf || function _setPrototypeOf(o, p) { o.__proto__ = p; return o; }; return _setPrototypeOf(o, p); }

function _getPrototypeOf(o) { _getPrototypeOf = Object.setPrototypeOf ? Object.getPrototypeOf : function _getPrototypeOf(o) { return o.__proto__ || Object.getPrototypeOf(o); }; return _getPrototypeOf(o); }

var fromJSON = function fromJSON(json) {
  var data = JSON.parse(json);

  if (!data.access_token && typeof data.access_token !== 'string') {
    throw new Error('access_token not present');
  }

  return {
    options: data,
    access_token: new String(data.access_token).toString()
  };
};

var EventEmitter = _events.default.EventEmitter;
var URL = 'https://auth.simperium.com/1';

var AuthError =
/*#__PURE__*/
function (_Error) {
  _inherits(AuthError, _Error);

  function AuthError(underlyingError) {
    var _this;

    _classCallCheck(this, AuthError);

    _this = _possibleConstructorReturn(this, _getPrototypeOf(AuthError).call(this, 'Failed to authenticate user.'));
    _this.underlyingError = underlyingError;
    return _this;
  }

  return AuthError;
}(_wrapNativeSuper(Error));
/**
 * Client for creating and authenticating Simperium.com user accounts.
 */


exports.AuthError = AuthError;

var Auth =
/*#__PURE__*/
function (_EventEmitter) {
  _inherits(Auth, _EventEmitter);

  /**
   * Creates an instance of the Auth client
   *
   * @param {string} appId - Simperium.com application ID
   * @param {string} appSecret - Simperium.com application secret
   */
  function Auth(appId, appSecret) {
    var _this2;

    _classCallCheck(this, Auth);

    _this2 = _possibleConstructorReturn(this, _getPrototypeOf(Auth).call(this));
    _this2.appId = appId;
    _this2.appSecret = appSecret;
    return _this2;
  }
  /**
   * Authorizes a user account with username and password
   *
   * @param {string} username account username
   * @param {string} password account password
   * @returns {Promise<User>} user account data
   */


  _createClass(Auth, [{
    key: "authorize",
    value: function authorize(username, password) {
      var body = JSON.stringify({
        username: username,
        password: password
      });
      return this.request('authorize/', body);
    }
  }, {
    key: "create",
    value: function create(username, password, provider) {
      var userData = {
        username: username,
        password: password
      };

      if (provider) {
        userData.provider = provider;
      }

      var body = JSON.stringify(userData);
      return this.request('create/', body);
    }
  }, {
    key: "getUrlOptions",
    value: function getUrlOptions(path) {
      var options = _url.default.parse("".concat(URL, "/").concat(this.appId, "/").concat(path));

      return _objectSpread({}, options, {
        method: 'POST',
        headers: {
          'X-Simperium-API-Key': this.appSecret
        }
      });
    }
  }, {
    key: "request",
    value: function request(endpoint, body) {
      var _this3 = this;

      return new Promise(function (resolve, reject) {
        var req = (0, _https.request)(_this3.getUrlOptions(endpoint), function (res) {
          var responseData = '';
          res.on('data', function (data) {
            responseData += data.toString();
          });
          res.on('end', function () {
            try {
              var user = fromJSON(responseData);
              resolve(user);

              _this3.emit('authorize', user);
            } catch (error) {
              return reject(new AuthError(error));
            }
          });
        });
        req.on('error', function (e) {
          reject(e);
        });
        req.end(body);
      });
    }
  }]);

  return Auth;
}(EventEmitter);

exports.Auth = Auth;
;

var _default = function _default(appId, appSecret) {
  return new Auth(appId, appSecret);
};

exports.default = _default;