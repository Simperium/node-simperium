var diff_match_patch = require('./diff_match_patch');

// stolen from https://raw.github.com/Simperium/jsondiff/master/src/jsondiff.js
(function() {
  var jsondiff,
    __bind = function(fn, me){ return function(){ return fn.apply(me, arguments); }; },
    __hasProp = Object.prototype.hasOwnProperty;

  jsondiff = (function() {

    function jsondiff(options) {
      this.options = options || {list_diff: true};
      this.patch_apply_with_offsets = __bind(this.patch_apply_with_offsets, this);
      this.transform_object_diff = __bind(this.transform_object_diff, this);
      this.transform_list_diff = __bind(this.transform_list_diff, this);
      this.apply_object_diff_with_offsets = __bind(this.apply_object_diff_with_offsets, this);
      this.apply_object_diff = __bind(this.apply_object_diff, this);
      this.apply_list_diff = __bind(this.apply_list_diff, this);
      this.diff = __bind(this.diff, this);
      this.object_diff = __bind(this.object_diff, this);
      this.list_diff = __bind(this.list_diff, this);
      this._common_suffix = __bind(this._common_suffix, this);
      this._common_prefix = __bind(this._common_prefix, this);
      this.object_equals = __bind(this.object_equals, this);
      this.list_equals = __bind(this.list_equals, this);
      this.equals = __bind(this.equals, this);
      this.deepCopy = __bind(this.deepCopy, this);
      this.typeOf = __bind(this.typeOf, this);
      this.entries = __bind(this.entries, this);
    }

    jsondiff.dmp = new diff_match_patch();

    jsondiff.prototype.entries = function(obj) {
      var key, n, value;
      n = 0;
      for (key in obj) {
        if (!__hasProp.call(obj, key)) continue;
        value = obj[key];
        n++;
      }
      return n;
    };

    jsondiff.prototype.typeOf = function(value) {
      var s;
      s = typeof value;
      if (s === 'object') {
        if (value) {
          if (typeof value.length === 'number' && typeof value.splice === 'function' && !value.propertyIsEnumerable('length')) {
            s = 'array';
          }
        } else {
          s = 'null';
        }
      }
      return s;
    };

    jsondiff.prototype.deepCopy = function(obj) {
      var i, out, _ref;
      if (Object.prototype.toString.call(obj) === '[object Array]') {
        out = [];
        for (i = 0, _ref = obj.length; 0 <= _ref ? i < _ref : i > _ref; 0 <= _ref ? i++ : i--) {
          out[i] = jsondiff.prototype.deepCopy(obj[i]);
        }
        return out;
      }
      if (typeof obj === 'object') {
        out = {};
        for (i in obj) {
          out[i] = jsondiff.prototype.deepCopy(obj[i]);
        }
        return out;
      }
      return obj;
    };

    jsondiff.prototype.equals = function(a, b) {
      var typea, typeb;
      typea = this.typeOf(a);
      typeb = this.typeOf(b);
      if (typea === 'boolean' && typeb === 'number') return Number(a) === b;
      if (typea === 'number' && typea === 'boolean') return Number(b) === a;
      if (typea !== typeb) return false;
      if (typea === 'array') {
        return this.list_equals(a, b);
      } else if (typea === 'object') {
        return this.object_equals(a, b);
      } else {
        return a === b;
      }
    };

    jsondiff.prototype.list_equals = function(a, b) {
      var alength, i;
      alength = a.length;
      if (alength !== b.length) return false;
      for (i = 0; 0 <= alength ? i < alength : i > alength; 0 <= alength ? i++ : i--) {
        if (!this.equals(a[i], b[i])) return false;
      }
      return true;
    };

    jsondiff.prototype.object_equals = function(a, b) {
      var key;
      for (key in a) {
        if (!__hasProp.call(a, key)) continue;
        if (!(key in b)) return false;
        if (!this.equals(a[key], b[key])) return false;
      }
      for (key in b) {
        if (!__hasProp.call(b, key)) continue;
        if (!(key in a)) return false;
      }
      return true;
    };

    jsondiff.prototype._common_prefix = function(a, b) {
      var i, minlen;
      minlen = Math.min(a.length, b.length);
      for (i = 0; 0 <= minlen ? i < minlen : i > minlen; 0 <= minlen ? i++ : i--) {
        if (!this.equals(a[i], b[i])) return i;
      }
      return minlen;
    };

    jsondiff.prototype._common_suffix = function(a, b) {
      var i, lena, lenb, minlen;
      lena = a.length;
      lenb = b.length;
      minlen = Math.min(a.length, b.length);
      if (minlen === 0) return 0;
      for (i = 0; 0 <= minlen ? i < minlen : i > minlen; 0 <= minlen ? i++ : i--) {
        if (!this.equals(a[lena - i - 1], b[lenb - i - 1])) return i;
      }
      return minlen;
    };

    jsondiff.prototype.list_diff = function(a, b) {
      var diffs, i, lena, lenb, maxlen, prefix_len, suffix_len;
      diffs = {};
      lena = a.length;
      lenb = b.length;
      prefix_len = this._common_prefix(a, b);
      suffix_len = this._common_suffix(a, b);
      a = a.slice(prefix_len, (lena - suffix_len));
      b = b.slice(prefix_len, (lenb - suffix_len));
      lena = a.length;
      lenb = b.length;
      maxlen = Math.max(lena, lenb);
      for (i = 0; 0 <= maxlen ? i <= maxlen : i >= maxlen; 0 <= maxlen ? i++ : i--) {
        if (i < lena && i < lenb) {
          if (!this.equals(a[i], b[i])) {
            diffs[i + prefix_len] = this.diff(a[i], b[i]);
          }
        } else if (i < lena) {
          diffs[i + prefix_len] = {
            'o': '-'
          };
        } else if (i < lenb) {
          diffs[i + prefix_len] = {
            'o': '+',
            'v': b[i]
          };
        }
      }
      return diffs;
    };

    jsondiff.prototype.object_diff = function(a, b) {
      var diffs, key;
      diffs = {};
      if (!(a != null) || !(b != null)) return {};
      for (key in a) {
        if (!__hasProp.call(a, key)) continue;
        if (key in b) {
          if (!this.equals(a[key], b[key])) diffs[key] = this.diff(a[key], b[key]);
        } else {
          diffs[key] = {
            'o': '-'
          };
        }
      }
      for (key in b) {
        if (!__hasProp.call(b, key)) continue;
        if (!(key in a)) {
          diffs[key] = {
            'o': '+',
            'v': b[key]
          };
        }
      }
      return diffs;
    };

    jsondiff.prototype.diff = function(a, b) {
      var diffs, typea;
      if (this.equals(a, b)) return {};
      typea = this.typeOf(a);
      if (typea !== this.typeOf(b)) {
        return {
          'o': 'r',
          'v': b
        };
      }
      switch (typea) {
        case 'boolean':
          return {
            'o': 'r',
            'v': b
          };
        case 'number':
          return {
            'o': 'r',
            'v': b
          };
        case 'array':
          if (this.options.list_diff) {
            return {
              'o': 'L',
              'v': this.list_diff(a, b)
            };
          } else {
            return {
              'o': 'r',
              'v': b
            };
          }
        case 'object':
          return {
            'o': 'O',
            'v': this.object_diff(a, b)
          };
        case 'string':
          diffs = jsondiff.dmp.diff_main(a, b);
          if (diffs.length > 2) jsondiff.dmp.diff_cleanupEfficiency(diffs);
          if (diffs.length > 0) {
            return {
              'o': 'd',
              'v': jsondiff.dmp.diff_toDelta(diffs)
            };
          }
      }
      return {};
    };

    jsondiff.prototype.apply_list_diff = function(s, diffs) {
      var deleted, dmp_diffs, dmp_patches, dmp_result, index, indexes, key, op, patched, s_index, shift, x, _i, _len, _ref, _ref2;
      patched = this.deepCopy(s);
      indexes = [];
      deleted = [];
      for (key in diffs) {
        if (!__hasProp.call(diffs, key)) continue;
        indexes.push(key);
        indexes.sort();
      }
      for (_i = 0, _len = indexes.length; _i < _len; _i++) {
        index = indexes[_i];
        op = diffs[index];
        shift = ((function() {
          var _j, _len2, _results;
          _results = [];
          for (_j = 0, _len2 = deleted.length; _j < _len2; _j++) {
            x = deleted[_j];
            if (x <= index) _results.push(x);
          }
          return _results;
        })()).length;
        s_index = index - shift;
        switch (op['o']) {
          case '+':
            [].splice.apply(patched, [s_index, s_index - s_index + 1].concat(_ref = op['v'])), _ref;
            break;
          case '-':
            [].splice.apply(patched, [s_index, s_index - s_index + 1].concat(_ref2 = [])), _ref2;
            deleted[deleted.length] = s_index;
            break;
          case 'r':
            patched[s_index] = op['v'];
            break;
          case 'I':
            patched[s_index] += op['v'];
            break;
          case 'L':
            patched[s_index] = this.apply_list_diff(patched[s_index], op['v']);
            break;
          case 'O':
            patched[s_index] = this.apply_object_diff(patched[s_index], op['v']);
            break;
          case 'd':
            dmp_diffs = jsondiff.dmp.diff_fromDelta(patched[s_index], op['v']);
            dmp_patches = jsondiff.dmp.patch_make(patched[s_index], dmp_diffs);
            dmp_result = jsondiff.dmp.patch_apply(dmp_patches, patched[s_index]);
            patched[s_index] = dmp_result[0];
        }
      }
      return patched;
    };

    jsondiff.prototype.apply_object_diff = function(s, diffs) {
      var dmp_diffs, dmp_patches, dmp_result, key, op, patched;
      patched = this.deepCopy(s);
      for (key in diffs) {
        if (!__hasProp.call(diffs, key)) continue;
        op = diffs[key];
        switch (op['o']) {
          case '+':
            patched[key] = op['v'];
            break;
          case '-':
            delete patched[key];
            break;
          case 'r':
            patched[key] = op['v'];
            break;
          case 'I':
            patched[key] += op['v'];
            break;
          case 'L':
            patched[key] = this.apply_list_diff(patched[key], op['v']);
            break;
          case 'O':
            patched[key] = this.apply_object_diff(patched[key], op['v']);
            break;
          case 'd':
            dmp_diffs = jsondiff.dmp.diff_fromDelta(patched[key], op['v']);
            dmp_patches = jsondiff.dmp.patch_make(patched[key], dmp_diffs);
            dmp_result = jsondiff.dmp.patch_apply(dmp_patches, patched[key]);
            patched[key] = dmp_result[0];
        }
      }
      return patched;
    };

    jsondiff.prototype.apply_object_diff_with_offsets = function(s, diffs, field, offsets) {
      var dmp_diffs, dmp_patches, dmp_result, key, op, patched;
      patched = this.deepCopy(s);
      for (key in diffs) {
        if (!__hasProp.call(diffs, key)) continue;
        op = diffs[key];
        switch (op['o']) {
          case '+':
            patched[key] = op['v'];
            break;
          case '-':
            delete patched[key];
            break;
          case 'r':
            patched[key] = op['v'];
            break;
          case 'I':
            patched[key] += op['v'];
            break;
          case 'L':
            patched[key] = this.apply_list_diff(patched[key], op['v']);
            break;
          case 'O':
            patched[key] = this.apply_object_diff(patched[key], op['v']);
            break;
          case 'd':
            dmp_diffs = jsondiff.dmp.diff_fromDelta(patched[key], op['v']);
            dmp_patches = jsondiff.dmp.patch_make(patched[key], dmp_diffs);
            if (key === field) {
              patched[key] = this.patch_apply_with_offsets(dmp_patches, patched[key], offsets);
            } else {
              dmp_result = jsondiff.dmp.patch_apply(dmp_patches, patched[key]);
              patched[key] = dmp_result[0];
            }
        }
      }
      return patched;
    };

    jsondiff.prototype.transform_list_diff = function(ad, bd, s) {
      var ad_new, b_deletes, b_inserts, diff, index, op, shift_l, shift_r, sindex, x;
      ad_new = {};
      b_inserts = [];
      b_deletes = [];
      for (index in bd) {
        if (!__hasProp.call(bd, index)) continue;
        op = bd[index];
        if (op['o'] === '+') b_inserts.push(index);
        if (op['o'] === '-') b_deletes.push(index);
      }
      for (index in ad) {
        if (!__hasProp.call(ad, index)) continue;
        op = ad[index];
        shift_r = [
          (function() {
            var _i, _len, _results;
            _results = [];
            for (_i = 0, _len = b_inserts.length; _i < _len; _i++) {
              x = b_inserts[_i];
              if (x <= index) _results.push(x);
            }
            return _results;
          })()
        ].length;
        shift_l = [
          (function() {
            var _i, _len, _results;
            _results = [];
            for (_i = 0, _len = b_deletes.length; _i < _len; _i++) {
              x = b_deletes[_i];
              if (x <= index) _results.push(x);
            }
            return _results;
          })()
        ].length;
        index = index + shift_r - shift_l;
        sindex = String(index);
        ad_new[sindex] = op;
        if (index in bd) {
          if (op['o'] === '+' && bd.index['o'] === '+') {
            continue;
          } else if (op['o'] === '-' && bd.index['o'] === '-') {
            delete ad_new[sindex];
          } else {
            diff = this.transform_object_diff({
              sindex: op
            }, {
              sindex: bd.index
            }, s);
            ad_new[sindex] = diff[sindex];
          }
        }
      }
      return ad_new;
    };

    jsondiff.prototype.transform_object_diff = function(ad, bd, s) {
      var a_patches, ab_text, ad_new, aop, b_patches, b_text, bop, dmp_diffs, dmp_patches, dmp_result, key, sk, _ref;
      ad_new = this.deepCopy(ad);
      for (key in ad) {
        if (!__hasProp.call(ad, key)) continue;
        aop = ad[key];
        if (!(key in bd)) continue;
        sk = s[key];
        bop = bd[key];
        if (aop['o'] === '+' && bop['o'] === '+') {
          if (this.equals(aop['v'], bop['v'])) {
            delete ad_new[key];
          } else {
            ad_new[key] = this.diff(bop['v'], aop['v']);
          }
        } else if (aop['o'] === '-' && bop['o'] === '-') {
          delete ad_new[key];
        } else if (bop['o'] === '-' && ((_ref = aop['o']) === 'O' || _ref === 'L' || _ref === 'I' || _ref === 'd')) {
          ad_new[key] = {
            'o': '+'
          };
          if (aop['o'] === 'O') {
            ad_new[key]['v'] = this.apply_object_diff(sk, aop['v']);
          } else if (aop['o'] === 'L') {
            ad_new[key]['v'] = this.apply_list_diff(sk, aop['v']);
          } else if (aop['o'] === 'I') {
            ad_new[key]['v'] = sk + aop['v'];
          } else if (aop['o'] === 'd') {
            dmp_diffs = jsondiff.dmp.diff_fromDelta(sk, aop['v']);
            dmp_patches = jsondiff.dmp.patch_make(sk, dmp_diffs);
            dmp_result = jsondiff.dmp.patch_apply(dmp_patches, sk);
            ad_new[key]['v'] = dmp_result[0];
          }
        } else if (aop['o'] === 'O' && bop['o'] === 'O') {
          ad_new[key] = {
            'o': 'O',
            'v': this.transform_object_diff(aop['v'], bop['v'], sk)
          };
        } else if (aop['o'] === 'L' && bop['o'] === 'L') {
          ad_new[key] = {
            'o': 'O',
            'v': this.transform_list_diff(aop['v'], bop['v'], sk)
          };
        } else if (aop['o'] === 'd' && bop['o'] === 'd') {
          delete ad_new[key];
          a_patches = jsondiff.dmp.patch_make(sk, jsondiff.dmp.diff_fromDelta(sk, aop['v']));
          b_patches = jsondiff.dmp.patch_make(sk, jsondiff.dmp.diff_fromDelta(sk, bop['v']));
          b_text = (jsondiff.dmp.patch_apply(b_patches, sk))[0];
          ab_text = (jsondiff.dmp.patch_apply(a_patches, b_text))[0];
          if (ab_text !== b_text) {
            dmp_diffs = jsondiff.dmp.diff_main(b_text, ab_text);
            if (dmp_diffs.length > 2) {
              jsondiff.dmp.diff_cleanupEfficiency(dmp_diffs);
            }
            if (dmp_diffs.length > 0) {
              ad_new[key] = {
                'o': 'd',
                'v': jsondiff.dmp.diff_toDelta(dmp_diffs)
              };
            }
          }
        }
        return ad_new;
      }
    };

    jsondiff.prototype.patch_apply_with_offsets = function(patches, text, offsets) {};

    jsondiff.prototype.patch_apply_with_offsets = function(patches, text, offsets) {
    if (patches.length == 0) {
      return text;
    }

    // Deep copy the patches so that no changes are made to originals.
    patches = jsondiff.dmp.patch_deepCopy(patches);
    var nullPadding = jsondiff.dmp.patch_addPadding(patches);
    text = nullPadding + text + nullPadding;

    jsondiff.dmp.patch_splitMax(patches);
    // delta keeps track of the offset between the expected and actual location
    // of the previous patch.  If there are patches expected at positions 10 and
    // 20, but the first patch was found at 12, delta is 2 and the second patch
    // has an effective expected position of 22.
    var delta = 0;
    for (var x = 0; x < patches.length; x++) {
      var expected_loc = patches[x].start2 + delta;
      var text1 = jsondiff.dmp.diff_text1(patches[x].diffs);
      var start_loc;
      var end_loc = -1;
      if (text1.length > jsondiff.dmp.Match_MaxBits) {
        // patch_splitMax will only provide an oversized pattern in the case of
        // a monster delete.
        start_loc = jsondiff.dmp.match_main(text,
            text1.substring(0, jsondiff.dmp.Match_MaxBits), expected_loc);
        if (start_loc != -1) {
          end_loc = jsondiff.dmp.match_main(text,
              text1.substring(text1.length - jsondiff.dmp.Match_MaxBits),
              expected_loc + text1.length - jsondiff.dmp.Match_MaxBits);
          if (end_loc == -1 || start_loc >= end_loc) {
            // Can't find valid trailing context.  Drop this patch.
            start_loc = -1;
          }
        }
      } else {
        start_loc = jsondiff.dmp.match_main(text, text1, expected_loc);
      }
      if (start_loc == -1) {
        // No match found.  :(
        /*
        if (mobwrite.debug) {
          window.console.warn('Patch failed: ' + patches[x]);
        }
        */
        // Subtract the delta for this failed patch from subsequent patches.
        delta -= patches[x].length2 - patches[x].length1;
      } else {
        // Found a match.  :)
        /*
        if (mobwrite.debug) {
          window.console.info('Patch OK.');
        }
        */
        delta = start_loc - expected_loc;
        var text2;
        if (end_loc == -1) {
          text2 = text.substring(start_loc, start_loc + text1.length);
        } else {
          text2 = text.substring(start_loc, end_loc + jsondiff.dmp.Match_MaxBits);
        }
        // Run a diff to get a framework of equivalent indices.
        var diffs = jsondiff.dmp.diff_main(text1, text2, false);
        if (text1.length > jsondiff.dmp.Match_MaxBits &&
            jsondiff.dmp.diff_levenshtein(diffs) / text1.length >
            jsondiff.dmp.Patch_DeleteThreshold) {
          // The end points match, but the content is unacceptably bad.
          /*
          if (mobwrite.debug) {
            window.console.warn('Patch contents mismatch: ' + patches[x]);
          }
          */
        } else {
          var index1 = 0;
          var index2;
          for (var y = 0; y < patches[x].diffs.length; y++) {
            var mod = patches[x].diffs[y];
            if (mod[0] !== DIFF_EQUAL) {
              index2 = jsondiff.dmp.diff_xIndex(diffs, index1);
            }
            if (mod[0] === DIFF_INSERT) {  // Insertion
              text = text.substring(0, start_loc + index2) + mod[1] +
                     text.substring(start_loc + index2);
              for (var i = 0; i < offsets.length; i++) {
                if (offsets[i] + nullPadding.length > start_loc + index2) {
                  offsets[i] += mod[1].length;
                }
              }
            } else if (mod[0] === DIFF_DELETE) {  // Deletion
              var del_start = start_loc + index2;
              var del_end = start_loc + jsondiff.dmp.diff_xIndex(diffs,
                  index1 + mod[1].length);
              text = text.substring(0, del_start) + text.substring(del_end);
              for (var i = 0; i < offsets.length; i++) {
                if (offsets[i] + nullPadding.length > del_start) {
                  if (offsets[i] + nullPadding.length < del_end) {
                    offsets[i] = del_start - nullPadding.length;
                  } else {
                    offsets[i] -= del_end - del_start;
                  }
                }
              }
            }
            if (mod[0] !== DIFF_DELETE) {
              index1 += mod[1].length;
            }
          }
        }
      }
    }
    // Strip the padding off.
    text = text.substring(nullPadding.length, text.length - nullPadding.length);
    return text;
  };

    return jsondiff;

  })();

  module.exports = jsondiff;

}).call();