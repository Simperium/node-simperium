// @flow
import { inherits } from 'util';
import events from 'events';

const { EventEmitter } = events;

export default function LocalQueue( store ) {
	this.store = store;
	this.sent = {};
	this.queues = {};
	this.ready = false;
}

inherits( LocalQueue, EventEmitter );

LocalQueue.prototype.start = function() {
	var queueId;
	this.ready = true;
	for ( queueId in this.queues ) {
		this.processQueue( queueId );
	}
}

LocalQueue.prototype.pause = function() {
	this.ready = false;
};

LocalQueue.prototype.acknowledge = function( change ) {
	if ( this.sent[change.id] === change ) {
		delete this.sent[change.id];
	}

	this.processQueue( change.id );
}

LocalQueue.prototype.queue = function( change ) {
	var queue = this.queues[change.id];

	if ( !queue ) {
		queue = [];
		this.queues[change.id] = queue;
	}

	queue.push( change );

	this.emit( 'queued', change.id, change, queue );

	if ( !this.ready ) return;

	this.processQueue( change.id );
};

LocalQueue.prototype.hasChanges = function() {
	return Object.keys( this.queues ).length > 0;
};

LocalQueue.prototype.dequeueChangesFor = function( id ) {
	var changes = [], sent = this.sent[id], queue = this.queues[id];

	if ( sent ) {
		delete this.sent[id];
		changes.push( sent );
	}

	if ( queue ) {
		delete this.queues[id];
		changes = changes.concat( queue );
	}

	return changes;
};

LocalQueue.prototype.processQueue = function( id ) {
	var queue = this.queues[id];
	var compressAndSend = this.compressAndSend.bind( this, id );

	// there is no queue, don't do anything
	if ( !queue ) return;

	// queue is empty, delete it from memory
	if ( queue.length === 0 ) {
		delete this.queues[id];
		return;
	}

	// waiting for a previous sent change to get acknowledged
	if ( this.sent[id] ) {
		this.emit( 'wait', id );
		return;
	}

	this.store.get( id ).then( compressAndSend );
}

LocalQueue.prototype.compressAndSend = function( id, ghost ) {
	var changes = this.queues[id];
	var change;
	var target = ghost.data;
	var c;
	var type;

	// a change was sent before we could compress and send
	if ( this.sent[id] ) {
		this.emit( 'wait', id );
		return;
	}

	if ( changes.length === 1 ) {
		change = changes.shift();
		this.sent[id] = change;
		this.emit( 'send', change );
		return;
	}

	if ( changes.length > 1 && changes[0].type === change_util.type.REMOVE ) {
		change = changes.shift();
		changes.splice( 0, changes.length - 1 );
		this.sent[id] = change;
		this.emit( 'send', change );
	}

	while ( changes.length > 0 ) {
		c = changes.shift();

		if ( c.o === change_util.type.REMOVE ) {
			changes.unshift( c );
			break;
		}

		target = change_util.apply( c.v, target );
	}

	type = target === null ? change_util.type.REMOVE : change_util.type.MODIFY;
	change = change_util.buildChange( type, id, target, ghost );

	this.sent[id] = change;
	this.emit( 'send', change );
}

LocalQueue.prototype.resendSentChanges = function() {
	for ( let ccid in this.sent ) {
		this.emit( 'send', this.sent[ccid] )
	}
}