var util = require('util');
var format = util.format;
var EventEmitter = require('events').EventEmitter;
var simperiumUtil = require('./util');
var arglock = simperiumUtil.fn.arglock;
var parseMessage = simperiumUtil.parseMessage;
var jsondiff = require('./jsondiff')();
var change_util = require('./util/change');
var uuid = require('node-uuid');

module.exports = Channel;

var operation = {
  MODIFY : 'M',
  REMOVE : '-'
};

function Channel(appid, access_token, bucket, store){

  this.appid = appid;
  this.bucket = bucket;
  this.store = store;
  this.access_token = access_token;

  this.session_id = 'node-' + uuid.v4();

  var message = this.message = new EventEmitter();

  message.on('auth', this.onAuth.bind(this));
  message.on('i', this.onIndex.bind(this));
  message.on('c', this.onChanges.bind(this));
  message.on('e', this.onVersion.bind(this));
  message.on('o', function() {});

  this.networkQueue = new NetworkQueue();
  this.localQueue = new LocalQueue(this.store);

  this.localQueue.on('send', private.sendChange.bind(this));

  // this.on('change', private.changeObject.bind(this));
  // this.on('index', arglock(this.emit, 'index').bind(this));
  var bucketEvents = new EventEmitter(),
      update = bucket.update,
      remove = bucket.remove;

  bucket.update = function(id, object, callback) {
    return update.call(bucket, id, object, function(err, id, object) {
      if (!err) bucketEvents.emit('update', id, object);
      if (callback) callback.apply(this, arguments);
    });
  };

  bucket.remove = function(id, callback) {
    return remove.call(bucket, id, function(err) {
      if (!err) bucketEvents.emit('remove', id);
      if (callback) callback.apply(this, arguments);
    });
  };

  bucketEvents
    .on('update', private.diffAndSend.bind(this))
    .on('remove', private.removeAndSend.bind(this));

}

util.inherits(Channel, EventEmitter);

Channel.prototype.handleMessage = function(data){

  var message = parseMessage(data);

  this.message.emit(message.command, message.data);
};

Channel.prototype.send = function(data){
  this.emit('send', data);
};

Channel.prototype.onAuth = function(data){
  try {
    var auth = JSON.parse(data);
    this.emit('unauthorized', auth);
    return;
  } catch (error) {
    if (this.cv) {
      this.sendChangeVersionRequest();
    } else {
      this.sendIndexRequest();    
    }
    return;
  }
};

Channel.prototype.onConnect = function(){

  var init = {
        name: this.bucket.name,
        clientid: this.session_id,
        api: "1.1",
        token: this.access_token,
        app_id: this.appid,
        library: 'node-simperium',
        version: "0.0.1"
      };

  this.send(format("init:%s", JSON.stringify(init)));
};

Channel.prototype.onIndex = function(data){

  var page    = JSON.parse(data),
      objects = page.index,
      mark    = page.mark,
      cv      = page.current,
    update  = private.updateObjectVersion.bind(this);

  objects.forEach(function(object, i){
    update(object.id, object.v, object.d);
  });

  if (!mark) {
    this.emit('index');
  } else {
    this.sendIndexRequest(mark);
  }

};

Channel.prototype.sendIndexRequest = function(mark){
  this.send(format("i:1:%s::10", mark ? mark : ''));
};

Channel.prototype.sendChangeVersionRequest = function() {
  this.send(format("cv:%s", this.cv));
};

Channel.prototype.onChanges = function(data){

  var changes = JSON.parse(data),
      onChange = private.changeObject.bind(this);

  changes.forEach(function(change){
    onChange(change.id, change);
  });

};

Channel.prototype.onVersion = function(data){
  var dataMark = data.indexOf("\n"),
      versionMark = data.indexOf('.'),
      id = data.slice(0, versionMark),
      version = parseInt(data.slice(versionMark+1, dataMark)),
      payload = JSON.parse(data.slice(dataMark+1));

  private.updateObjectVersion.call(this, id, version, payload.data);
};


function NetworkQueue(){
  this.queues = {};
}

NetworkQueue.prototype.queueFor = function(id){
  var queues = this.queues,
      queue = queues[id];

  if (!queue) {
    queue = new Queue();
    queue.on('finish', function(){
      delete queues[id];
    });
    queues[id] = queue;
  }

  return queue;
};

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
};

Queue.prototype.start = function(){
  if (this.running) return;
  this.running = true;
  this.emit('start');
  setImmediate(this.run.bind(this));
};

Queue.prototype.run = function(){
  this.running = true;


  if (this.queue.length === 0) {
    this.running = false;
    this.emit('finish');
    return;
  }

  var fn = this.queue.shift();
  fn(this.run.bind(this));

};

function LocalQueue(store){
  this.store = store;
  this.sent = {};
  this.queues = {};
}

util.inherits(LocalQueue, EventEmitter);

LocalQueue.prototype.acknowledge = function(change){
  if (this.sent[change.id] == change) {
    delete this.sent[change.id];
  }

  this.processQueue(change.id);

};

LocalQueue.prototype.queue = function(change){
  var queue = this.queues[change.id];

  if (!queue) {
    queue = [];
    this.queues[change.id] = queue;
  }

  queue.push(change);

  this.emit('queued', change.id, change, queue);

  this.processQueue(change.id);

};

LocalQueue.prototype.processQueue = function(id){
  var queue = this.queues[id],
      sent = this.sent;

  // there is no queue, don't do anything
  if (!queue) return;

  // queue is empty, delete it from memory
  if (queue.length === 0) {
    delete this.queues[id];
    return;
  }

  // waiting for a previous sent change to get acknowledged
  if (this.sent[id]) {
    this.emit('wait', id);
    return;
  }

  // ready to send out a change, time to compress these changes
  var changes = queue;

  var compressAndSend = arglock(this.compressAndSend, id, changes).bind(this);
  this.store.get(id).then(compressAndSend);

};

LocalQueue.prototype.compressAndSend = function(id, changes, ghost){

  var change;

  // a change was sent before we could compress and send
  if (this.sent[id]){
    this.emit('wait', id);
    return;
  }

  if (changes.length == 1) {
    change = changes.shift();
    this.sent[id] = change;
    this.emit('send', change);
    return;
  }

  // TODO: fix this
  // 1) Loop through each change and combine modifications
  // 2) stop at first remove change
  var target = ghost.data;
  while (changes.length > 0) {
    var c = changes.shift();

    if (c.o == change_util.type.REMOVE) {
      changes.unshift(c);
      break;
    }

    jsondiff.apply_object_diff(target, c.v);
  }

  var type = target === null ? change_util.type.REMOVE : change_util.type.MODIFY;

  change = change_util.buildChange(type, id, target, ghost);

  this.sent[id] = change;
  this.emit('send', change);

};


var private = {};

// Called when receive a change from the network. Attempt to apply the change
// to the ghost object and notify.
private.changeObject = function(id, change){
  // pull out the object from the store and apply the change delta
  var applyChange = arglock(private.performChange, change).bind(this);

  this.networkQueue.queueFor(id).add(function(done){
    applyChange().then(done);
  });

};

private.buildModifyChange = function(id, object, ghost){
  var payload = change_util.buildChange(change_util.type.MODIFY, id, object, ghost);
  this.localQueue.queue(payload);
};

private.buildRemoveChange = function(id, object, ghost){
  var payload = change_util.buildChange(change_util.type.REMOVE, id, object, ghost);
  this.localQueue.queue(payload);
};


private.sendChange = function(data){
  this.emit('send', format("c:%s", JSON.stringify(data)));
};

private.diffAndSend = function(id, object){

  var modify = arglock(private.buildModifyChange, id, object).bind(this);
  return this.store.get(id).then(modify);

};

private.removeAndSend = function(id, object) {
  var remove = arglock(private.buildRemoveChange, id, object).bind(this);
  return this.store.get(id).then(remove);
};

// We've receive a full object from the network. Update the local instance and
// notify of the new object version
private.updateObjectVersion = function(id, version, data, acknowledged){

  var notify;
  if (!acknowledged) {
    notify = arglock(this.emit, 'update', id, data).bind(this);
  } else {
    notify = arglock(private.updateAcknowledged, acknowledged).bind(this);
  }

  return this.store.put(id, version, data).then(
    notify
  );

};

private.updateAcknowledged = function(change){
  var id = change.id;
  if (this.localQueue.sent[id] == change) {
    this.localQueue.acknowledge(change);
    this.emit('acknowledge', id, change);
  }
};

private.performChange = function(change){
  if (!change.sv) {
    // just apply the change to a new object
    return private.applyChange.call(this, change, {data:{}});
  } else {
    return this.store.get(change.id).then(
      arglock(private.applyChange, change).bind(this),
      console.error.bind(console)
    );
  }

};

private.findAcknowledgedChange = function(change){
  var possibleChange = this.localQueue.sent[change.id];

  if (possibleChange) {
    if (change.ccids.indexOf(possibleChange.ccid) > -1) return possibleChange;
  }

};

private.applyChange = function(change, ghost){

  var acknowledged = private.findAcknowledgedChange.bind(this)(change);
  // attempt to apply the change
  if (change.o == operation.MODIFY && ghost.version === change.sv) {
    var modified = jsondiff.apply_object_diff(ghost.data, change.v),
        emit = arglock(this.emit, format("change.%s", change.id)).bind(this);

    return private.updateObjectVersion.bind(this)(change.id, change.ev, modified, acknowledged)
      .then(emit);

  } else {
    this.emit('error', "Could not apply change", change);
  }

};
