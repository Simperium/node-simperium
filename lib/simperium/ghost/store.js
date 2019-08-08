"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = Store;

/**
 * An in memory implementation of GhostStore
 *
 * @param {Bucket} bucket instance to save ghost data for
 */
function Store(bucket) {
  this.bucket = bucket;
  this.index = {};
}

Store.prototype.getChangeVersion = function () {
  var _this = this;

  return new Promise(function (resolve) {
    setImmediate(function () {
      resolve(_this.cv);
    });
  });
};

Store.prototype.setChangeVersion = function (cv) {
  var _this2 = this;

  return new Promise(function (resolve) {
    setImmediate(function () {
      _this2.cv = cv;
      resolve(cv);
    });
  });
};

Store.prototype.put = function (id, version, data) {
  var _this3 = this;

  return new Promise(function (resolve) {
    setImmediate(function () {
      _this3.index[id] = JSON.stringify({
        version: version,
        data: data
      });
      resolve(true);
    });
  });
};

Store.prototype.get = function (id) {
  var _this4 = this;

  return new Promise(function (resolve) {
    setImmediate(function () {
      var ghost = _this4.index[id];

      if (!ghost) {
        ghost = {
          data: {}
        };
        ghost.key = id;
        _this4.index[id] = JSON.stringify(ghost);
      } else {
        ghost = JSON.parse(ghost);
      }

      resolve(ghost);
    });
  });
};

Store.prototype.remove = function (id) {
  var _this5 = this;

  return new Promise(function (resolve) {
    setImmediate(function () {
      delete _this5.index[id];
      resolve();
    });
  });
};