var assert = require('assert');
var EventEmitter = require('events').EventEmitter;
var Bucket = require('../../lib/simperium/bucket');
var defaultGhostStoreProvider = require('../../lib/simperium/ghost/default');
var defaultObjectStoreProvider = require('../../lib/simperium/storage/default');
var util = require('util');
var jsondiff = require('../../lib/simperium/jsondiff')();
var fn = require('../../lib/simperium/util/fn');

describe('Bucket', function(){

  it('should store object update', function(done){

    var bucket  = mockBucket()
      , channel = bucket.channel
      , id      = 'object'
      , version = 1;

    bucket.on('update', function(updatedId){
      assert.equal(updatedId, id);
      done();
    });

    channel.emit('version', id, version, { content:'lol' } );

  })

  it('should apply change', function(done){

    var bucket  = mockBucket()
      , channel = bucket.channel
      , id      = 'object'
      , version = 1
      , data    = { content: 'Lol' }
      , change  = { sv: version,
                     o: 'M',
                     id: id,
                     clientid: 'sjs-2013070502-a1fab97d463883d66bae',
                     v: jsondiff.object_diff(data, {content: 'hola mundo'}),
                     ev: 106,
                     cv: '5262d90aba5fdc4ed7eb2bc7',
                     ccids: [ 'ebd2c21c8a91be24c078746d9e935a3a' ]
                   }

    bucket.once('update', function(id, data){

      assert.equal(data.content, 'Lol');

      bucket.once('update', function(id, data){
        assert.equal(data.content, 'hola mundo');
        done();
      });

    });

    channel.emit('version', id, version, data );
    channel.emit('change', id, change);

  });

  it('should queue multiple changes', function(done){

    var bucket = mockBucket()
      , diff = jsondiff.object_diff.bind(jsondiff)
      , channel = bucket.channel
      , id = 'object'
      , version = 1
      , version1 = { content: 'step 1'}
      , version2 = { content: 'step 2'}
      , version3 = { content: 'step 3'}
      , change1 = { o: 'M', ev:1, cv:'cv1', id:id, v:diff({}, version1)}
      , change2 = { o: 'M', ev:2, sv:1, cv:'cv2', id:id, v:diff(version1, version2)}
      , change3 = { o: 'M', ev:3, sv:2, cv:'cv3', id:id, v:diff(version2, version3)}
      , check = fn.counts(2, function(id, data){
          assert.equal(data.content, 'step 3');
          done();
        });

    bucket.on('update', check);

    channel.emit('change', id, change1);
    channel.emit('change', id, change2);
    channel.emit('change', id, change3);

  })

  it('should send change to create object', function(done){

    var bucket = mockBucket()
      , channel = bucket.channel;

    channel.on('send', function(data){
      var marker = data.indexOf(':')
        , command = data.substring(0, marker)
        , payload = JSON.parse(data.substring(marker +1))
        , diff = payload.v;

      assert.equal(command, 'c');
      assert.equal(diff.content.o, '+');
      assert.equal(diff.content.v, 'Hola mundo!');
      done();

    });

    bucket.add({content: "Hola mundo!"});

  })

  it('should queue a change when pending exists', function(done){

    var bucket    = mockBucket(),
        channel   = bucket.channel,
        data      = { title: "Hola mundo!", content: "Bienvenidos a Simperium" },
        data2     = { title: "Hell world!", content: "Welcome to Simperium" },
        checkSent = function(){
          throw new Error("Sent too many changes");
        },
        objectId;

    channel.on('send', fn.counts(1, checkSent));

    bucket.localQueue.on('wait', function(id){
      assert.equal(id, objectId);
      done();
    });

    objectId = bucket.add(data);
    bucket.update(objectId, data2);

  })

});

function mockBucket(){

  var channel = new MockChannel()
    , options = {
      ghostStoreProvider: defaultGhostStoreProvider,
      objectStoreProvider: defaultObjectStoreProvider
    };

  return new Bucket('things', {access_token:'123'}, channel, options);
}

function MockChannel(){

}

util.inherits(MockChannel, EventEmitter);

MockChannel.prototype.send = function(data){
  this.emit('send', data);
}

