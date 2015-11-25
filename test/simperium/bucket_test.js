var assert = require('assert');
import Bucket from '../../lib/simperium/bucket'
import storeProvider from './mock_bucket_store'
import util from 'util'
import { fn } from '../../lib/simperium/util'
import { format } from 'util'
import { parseMessage } from '../../lib/simperium/util'

describe('Bucket', function(){

  var bucket, store;

  beforeEach(function() {

    bucket = new Bucket('things', storeProvider);
    store = bucket.store;

  });

  it('should fetch object data', function(done) {

    var object = {title: 'hi'};
    store.objects = {
      'hello': object
    };

    bucket.get('hello', function(e, found) {
      assert.deepEqual(found, object);
      done();
    });

  });

  it('should store object update', function(done){

    var id      = 'thing',
        version = 1,
        object  = {"one": "two"};

    bucket.update(id, object, function(error, updatedId, savedObject) {
      bucket.get(id, function(err, savedObject) {
        assert.deepEqual(object, savedObject);
        done();
      });
    });

  });

  it('should delete object data', function(done) {

    store.objects = {
      'hello': {title: 'hola mundo'}
    };

    bucket.remove('hello', function(err, id) {
      assert.ok(!store.objects.hello);
      done();
    });

  });

});

