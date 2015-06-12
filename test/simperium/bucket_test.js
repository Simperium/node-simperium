var assert = require('assert');
var Bucket = require('../../lib/simperium/bucket');
var storeProvider = require('./mock_bucket_store');
var util = require('util');
var simperiumUtil = require('../../lib/simperium/util');
var fn = simperiumUtil.fn;
var format = util.format;
var parseMessage = simperiumUtil.parseMessage;
var MockChannel = require('./mock_channel.js');

describe('Bucket', function(){

  var bucket, channel, store;

  beforeEach(function() {

    bucket = new Bucket('things', {access_token:'123'}, storeProvider);
    store = bucket.store;
    channel = new MockChannel();

  });

  it('should fetch object data', function(done) {

    var object = {title: 'hi'};
    store.objects = {
      'hello': object
    };

    bucket.get('hello', function(e, id, found) {
      assert.equal(id, 'hello');
      assert.deepEqual(found, object);
      done();
    });

  });

  it('should store object update', function(done){

    var id      = 'thing',
        version = 1,
        object  = {"one": "two"};

    bucket.update(id, object, function(error, updatedId, savedObject) {
      bucket.get(id, function(err, id, savedObject) {
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

