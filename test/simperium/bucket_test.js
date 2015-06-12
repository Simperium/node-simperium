var assert = require('assert');
var Bucket = require('../../lib/simperium/bucket');
var defaultGhostStoreProvider = require('../../lib/simperium/ghost/default');
var defaultObjectStoreProvider = require('../../lib/simperium/storage/default');
var util = require('util');
var simperiumUtil = require('../../lib/simperium/util');
var fn = simperiumUtil.fn;
var format = util.format;
var parseMessage = simperiumUtil.parseMessage;
var MockChannel = require('./mock_channel.js');

describe('Bucket', function(){

  var bucket, channel;

  beforeEach(function() {

    bucket = new Bucket('things', {access_token:'123'}, defaultObjectStoreProvider);
    channel = new MockChannel();

  });

  it('should store object update', function(done){

    var id      = 'thing',
        version = 1,
        object  = {"one": "two"},
        updateCount = 0;

    bucket.on('update', function() {
      updateCount ++;
    });

    bucket.update(id, object, function(error, updatedId, savedObject) {
      bucket.get(id, function(err, id, savedObject) {
        assert.deepEqual(object, savedObject);
        assert.equal(updateCount, 1);
        done();
      });
    });

  });


});

