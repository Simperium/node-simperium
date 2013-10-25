var util = require('util');
var EventEmitter = require('events').EventEmitter;
var format = util.format;
var jsondiff = require('./jsondiff')();
var uuid = require('node-uuid');
var change_util = require('./util/change');

var arglock = require('./util/fn').arglock;

var operation = {
  MODIFY : 'M',
  REMOVE : '-'
};

module.exports = Bucket;

function Bucket(name, user, channel, options) {
  this.name = name;
  this.user = user;
  this.channel = channel;

  options = options || {};

  this.ghostStore = options.ghostStoreProvider(user, this);
  this.objectStore = options.objectStoreProvider(user, this);

  channel.on('change', private.changeObject.bind(this));
  channel.on('version', private.updateObjectVersion.bind(this));
  channel.on('index', arglock(this.emit, 'index').bind(this));

  this.networkQueue = new NetworkQueue();
  this.localQueue = new LocalQueue(this.ghostStore);

  this.localQueue.on('send', private.sendChange.bind(this));
}

util.inherits(Bucket, EventEmitter);

Bucket.prototype.add = function(object){

  var id = uuid.v4();
  this.update(id, object);

  return id;

}

Bucket.prototype.update = function(id, object){
  private.diffAndSend.bind(this)(id, object);
}

var private = {};

// Called when receive a change from the network. Attempt to apply the change
// to the ghost object and notify.
private.changeObject = function(id, change){
  // pull out the object from the ghostStore and apply the change delta

  var apply = arglock(private.performChange, change).bind(this)

  this.networkQueue.queueFor(id).add(function(done){
    apply().then(done);
  });

}

private.buildModifyChange = function(id, object, ghost){
  var payload = change_util.buildChange(change_util.type.MODIFY, id, object, ghost);
  this.localQueue.queue(payload);
}

private.sendChange = function(data){
  this.channel.send(format("c:%s", JSON.stringify(data)));
}

private.diffAndSend = function(id, object){

  var modify = arglock(private.buildModifyChange, id, object).bind(this);
  return this.ghostStore.get(id).then(modify);

}

// We've receive a full object from the network. Update the local instance and
// notify of the new object version
private.updateObjectVersion = function(id, version, data){
  return this.ghostStore.put(id, version, data).then(
    arglock(this.emit, 'update', id, data).bind(this)
  );

}

private.performChange = function(change){

  if (!change.sv) {
    // just apply the change to a new object
    return private.applyChange.call(this, change, {data:{}, v:0});
  } else {
    return this.ghostStore.get(change.id).then(
      arglock(private.applyChange, change).bind(this),
      console.error
    );
  }

}


private.applyChange = function(change, ghost){
  // attempt to apply the change
  if (change.o == operation.MODIFY && ghost.version == change.sv) {

    var modified = jsondiff.apply_object_diff(ghost.data, change.v)
      , emit = arglock(this.emit, format("change.%s", change.id)).bind(this);

    return private.updateObjectVersion.bind(this)(change.id, change.ev, modified)
      .then(emit);

  } else {
    this.emit('error', "Could not apply change", change);
  }

}

function NetworkQueue(){

  this.queues = {};
}

NetworkQueue.prototype.queueFor = function(id){
  var queues = this.queues
    , queue = queues[id];

  if (queue == null) {
    queue = new Queue();
    queue.on('finish', function(){
      delete queues[id]
    });
    queues[id] = queue;
  }

  return queue;
}

function Queue(){

  this.queue = [];
  this.running = false;
}

util.inherits(Queue, EventEmitter);

// Add a function at the end of the queue
Queue.prototype.add = function(fn){
  this.queue.push(fn);
  this.start();
  return this;
}

Queue.prototype.start = function(){
  if (this.running) return;
  this.running = true;
  this.emit('start');
  setImmediate(this.run.bind(this));
}

Queue.prototype.run = function(){
  this.running = true;


  if (this.queue.length == 0) {
    this.running = false;
    this.emit('finish');
    return;
  }

  var fn = this.queue.shift();
  fn(this.run.bind(this));

}

function LocalQueue(ghostStore){
  this.ghostStore = ghostStore;
  this.sent = {};
  this.queues = {};
}

util.inherits(LocalQueue, EventEmitter);

LocalQueue.prototype.queue = function(change){
  var queue = this.queues[change.id];

  if (!queue) {
    queue = [];
    this.queues[change.id] = queue;
  }

  queue.push(change);

  this.emit('queued', change);

  this.processQueue(change.id);

}

LocalQueue.prototype.processQueue = function(id){
  var queue = this.queues[id],
      sent = this.sent;

  // there is no queue, don't do anything
  if (!queue) return;

  // queue is empty, delete it from memory
  if (queue.length == 0) {
    delete this.queues[id];
    return;
  }

  // waiting for a previous sent change to get acknowledged
  if (this.sent[id]) return;

  // ready to send out a change, time to compress these changes
  var changes = queue;
  this.queues[id] = [];

  var compressAndSend = arglock(this.compressAndSend, id, changes).bind(this);
  this.ghostStore.get(id).then(compressAndSend);

}

LocalQueue.prototype.compressAndSend = function(id, changes, ghost){

  // a change was sent before we could compress and send
  if (this.sent[id]){
    this.emit('wait', id);
    return;
  }

  if (changes.length == 1) {
    this.sent[id] = changes[0];
    this.emit('send', changes[0]);
    return;
  }

  var target = changes.reduce(function(origin, change){

    if (origin == null || change.o == change_util.type.REMOVE)
      return null;

    return jsondiff.apply_object_diff(origin, change.v);
  }, ghost.data);

  var type = target == null ? change_util.type.REMOVE : change_util.type.MODIFY,
      change = change_util.buildChange(type, id, target, ghost);

  this.sent[id] = change;
  this.emit('send', change);

}

