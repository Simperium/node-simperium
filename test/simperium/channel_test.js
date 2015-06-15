var Channel = require('../../lib/simperium/channel');
var EventEmitter = require('events').EventEmitter;
var util = require('util');
var parseMessage = require('../../lib/simperium/util').parseMessage;
var assert = require('assert');
var simperiumUtils = require('../../lib/simperium/util');
var fn = simperiumUtils.fn;
var jsondiff = require('../../lib/simperium/jsondiff')();
var defaultGhostStoreProvider = require('../../lib/simperium/ghost/default');


describe('Channel', function(){

  var channel, bucket, store;

  beforeEach(function() {
    bucket = new EventEmitter();
    bucket.update = bucket.remove = function(){
      var args = [].slice.apply(arguments);
      args.slice(-1)[0].apply(this, [null].concat(args.slice(0,-1)));
    };
    bucket.name = 'things';
    store = defaultGhostStoreProvider(bucket);
    channel = new Channel('mock-app-id', 'mock-token', bucket, store);
  });

  it('should send init on connect', function(done){

    channel.on('send', function(data){
      var message = parseMessage(data),
          payload = JSON.parse(message.data);

      assert.ok(payload.name);
      assert.equal('init', message.command);
      assert.equal('mock-token', payload.token);
      assert.equal(payload.api, "1.1");
      assert.equal('mock-app-id', payload.app_id);
      assert.equal('node-simperium', payload.library);
      assert.equal(payload.version, '0.0.1');
      done();
    });

    channel.onConnect();

  });

  it('should apply change', function(done){

    var id      = 'object',
        version = 1,
        data    = { content: 'Lol' },
        changes = [{ sv: version,
                     o: 'M',
                     id: id,
                     clientid: 'sjs-2013070502-a1fab97d463883d66bae',
                     v: jsondiff.object_diff(data, {content: 'hola mundo'}),
                     ev: 106,
                     cv: '5262d90aba5fdc4ed7eb2bc7',
                     ccids: [ 'ebd2c21c8a91be24c078746d9e935a3a' ]
                   }];

    channel.once('update', function(id, data){

      assert.equal(data.content, 'Lol');

      channel.once('update', function(id, data){
        assert.equal(data.content, 'hola mundo');
        done();
      });

    });

    channel.handleMessage(util.format("i:%s", JSON.stringify({index: [{v:version,id: id, d: data}]})));
    channel.handleMessage(util.format("c:%s", JSON.stringify(changes)));

  });

  it('should queue multiple changes', function(done){

    var diff = jsondiff.object_diff.bind(jsondiff),
        id = 'object',
        version = 1,
        version1 = { content: 'step 1'},
        version2 = { content: 'step 2'},
        version3 = { content: 'step 3'},
        change1 = { o: 'M', ev:1, cv:'cv1', id:id, v:diff({}, version1)},
        change2 = { o: 'M', ev:2, sv:1, cv:'cv2', id:id, v:diff(version1, version2)},
        change3 = { o: 'M', ev:3, sv:2, cv:'cv3', id:id, v:diff(version2, version3)},
        check = fn.counts(2, function(id, data){
          assert.equal(data.content, 'step 3');
          done();
        });

    channel.on('update', check);

    channel.onChanges(JSON.stringify([change1, change2, change3]));

  });

  it('should send change to create object', function(done){

    channel.on('send', function(data){
      var marker = data.indexOf(':'),
          command = data.substring(0, marker),
          payload = JSON.parse(data.substring(marker +1)),
          diff = payload.v;

      assert.equal(command, 'c');
      assert.equal(diff.content.o, '+');
      assert.equal(diff.content.v, 'Hola mundo!');
      done();

    });

    bucket.update('12345', {content: "Hola mundo!"});

  });

  it('should queue a change when pending exists', function(done){

    var data      = { title: "Hola mundo!", content: "Bienvenidos a Simperium" },
        data2     = { title: "Hell world!", content: "Welcome to Simperium" },
        checkSent = function(){
          throw new Error("Sent too many changes");
        },
        objectId = '123456';

    channel.on('send', fn.counts(1, checkSent));

    channel.localQueue.on('wait', function(id){
      assert.equal(id, objectId);
      done();
    });

    objectId = '123456';
    bucket.update(objectId, data);
    bucket.update(objectId, data2);

  });

  it('should acknowledge sent change', function(done){

    var data = { title: "Auto acknowledge!" };

    channel.on('acknowledge', function(id){
      assert.equal(undefined, channel.localQueue.sent[id]);
      done();
    });

    channel.on('send', function(msg) {
      acknowledge(channel, msg);
    });

    bucket.update('mock-id', data);

  });

  it("should send remove operation", function(done){

    channel.on('send', function(msg) {
      var message = parseMessage(msg),
          change = JSON.parse(message.data);

      assert.equal(change.o, '-');
      assert.equal(change.id, '123');

      // acknowledge the change
      acknowledge(channel, msg);

    });

    channel.on('acknowledge', function() {

      store.get("123").then(function(ghost) {
        assert.ok(!ghost.version, "store should have deleted ghost");
        assert.deepEqual(ghost.data, {});
        done();
      });

    });

    store.put("123", 3, {title: "hello world"}).then(function() {
      store.get("123").then(function(ghost) {
        assert.equal(ghost.version, 3);
        bucket.remove('123');
      });
    });

  });

  it("should wait for changes before removing", function(done) {
    var validate = fn.counts(1, function(id) {
      var queue = channel.localQueue.queues["123"];
      assert.equal(queue.length, 2);
      assert.equal(queue.slice(-1)[0].o, '-');
      done();
    });

    channel.localQueue.on('wait', validate);

    channel.once('send', function(msg) {
      bucket.update("123", {title: "hello again world"});
      bucket.remove("123");
    });

    store.put("123", 3, {title: "hello world"}).then(function() {
      bucket.update("123", {title: "goodbye world"});
    });

  });

  // TODO: handle auth failures
  // <=  0:auth:expired
  // =>  0:i:1:::10
  // <=  0:auth:{"msg": "Error validating token", "code": 500}
  // =>  0:i:1:::10
  
  it("should report failed auth", function(done) {

    channel.on("unauthorized", function(){
      done();
    });

    channel.onConnect();
    channel.handleMessage('auth:{"msg": "Error validating token", "code": 500}');

  });

  describe('after authorizing', function() {

    beforeEach(function(next) {

      channel.once('send', function() {
        next();
      });

      channel.onConnect();
      channel.handleMessage('auth:user@example.com');

    });

    it('should request index', function(done) {

      channel.once('send', function(data) {
        var message = parseMessage(data);

        assert.equal('i', message.command);
        assert.equal('1:::10', message.data);
        done();      
      });

    });

    it('should request cv', function(done) {

      channel.cv = 'abcdefg';

      channel.once('send', function(data) {
        var message = parseMessage(data);
        assert.equal('cv', message.command);
        assert.equal('abcdefg', message.data);
        done();
      });

    });

  });

});

function acknowledge(channel, msg) {
  var message = parseMessage(msg),
      change = JSON.parse(message.data),
      ack = {
        id: change.id,
        o: change.o,
        v: change.v,
        ev: change.sv ? change.sv + 1 : 0,
        ccids: [change.ccid]
      };

      if (change.sv) {
        ack.sv = change.sv;
      }

  channel.handleMessage(util.format("c:%s", JSON.stringify([ack])));
}