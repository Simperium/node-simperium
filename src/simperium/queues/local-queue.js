// @flow
import events from 'events';
import * as change_util from '../util/change';
import type { BucketOperation } from '../util/change';

const { EventEmitter } = events;

/**
 * A ghost represents a version of a bucket object as known by Simperium
 *
 * Generally a client will keep the last known ghost stored locally for efficient
 * diffing and patching of Simperium change operations.
 *
 * @typedef {Object} Ghost
 * @property {Number} version - the ghost's version
 * @property {String} key - the simperium bucket object id this ghost is for
 * @property {Object} data - the data for the given ghost version
 */
type Ghost = { version: number, key: string, data: {} };

/**
 * A GhostStore provides the store mechanism for ghost data that the Channel
 * uses to maintain syncing state and producing change operations for
 * Bucket objects.
 *
 * @interface GhostStore
 */
interface GhostStore {

	/**
	 * Callback function used by the ghost store to iterate over existing ghosts
	 *
	 * @callback ghostIterator
	 * @param {Ghost} - the current ghost
	 */

	/**
	 * Retrieve a Ghost for the given bucket object id
	 *
	 * @function
	 * @name GhostStore#get
	 * @param {String} id - bucket object id
	 * @returns {Promise<Ghost>} - the ghost for this object
	 */
	get( id: string ): Promise<Ghost>;

	/**
	 * Save a ghost in the store.
	 *
	 * @function
	 * @name GhostStore#put
	 * @param {String} id - bucket object id
	 * @param {Number} version - version of ghost data
	 * @param {Object} data - object literal to save as this ghost's data for this version
	 * @returns {Promise<Ghost>} - the ghost for this object
	 */

	/**
	 * Delete a Ghost from the store.
	 *
	 * @function
	 * @name GhostStore#remove
	 * @param {String} id - bucket object id
	 * @returns {Promise<Ghost>} - the ghost for this object
	 */

	/**
	 * Iterate over existing Ghost objects with the given callback.
	 *
	 * @function
	 * @name GhostStore#eachGhost
	 * @param {ghostIterator} - function to run against each ghost
	 */

	/**
	 * Get the current change version (cv) that this channel has synced.
	 *
	 * @function
	 * @name GhostStore#getChangeVersion
	 * @returns {Promise<String>} - the current change version for the bucket
	 */

	/**
	 * Set the current change version.
	 *
	 * @function
	 * @name GhostStore#setChangeVersion
	 * @returns {Promise<Void>} - resolves once the change version is saved
	 */
}

export default class LocalQueue extends EventEmitter {
	store: GhostStore;
	sent: { [objectId: string]: BucketOperation };
	queues: { [objectId: string]: BucketOperation[] };
	ready: boolean

	/*
	 * @param {GhostStore} store - the ghost store for retrieving ghost data
	 */
	constructor( store: GhostStore ) {
		super();
		this.store = store;
		this.sent = {};
		this.queues = {};
		this.ready = false;
	}

	/*
	 * Start processing any local changes
	 */
	start() {
		this.ready = true;
		for ( const queueId in this.queues ) {
			this.processQueue( queueId );
		}
	}

	/**
	 * Pause execution of local changes. No local changes will be sent to
	 * simperium until .start is called.
	 */
	pause() {
		this.ready = false;
	};

	/**
	 * When a change is acknowledged and it matches the sent change for the
	 * given bucket operation clear it from the sent queue.
	 *
	 * Any pending changes for the bucket object will then be sent.
	 *
	 * @param {BucketOperation} change - the operation that is being acknowledged
	 */
	acknowledge( change: BucketOperation ) {
		if ( this.sent[change.id] === change ) {
			delete this.sent[change.id];
		}

		this.processQueue( change.id );
	}

	/**
	 * Queues a on operation that will modify a bucket object on simperium.com. If the
	 * local queue has been started the queue for the corresponding bucket object will
	 * be processed and the next change will be sent.
	 *
	 * @param {BucketOperation} change - the bucket operation to send to simperium
	 */
	queue( change: BucketOperation ) {
		let queue = this.queues[change.id];

		if ( !queue ) {
			queue = [];
			this.queues[change.id] = queue;
		}

		queue.push( change );

		this.emit( 'queued', change.id, change, queue );

		if ( !this.ready ) return;

		this.processQueue( change.id );
	};

	/**
	 * Reports if there are any changes pending for this channel.
	 *
	 * @returns {boolean} true if there are any pending changes
	 */
	hasChanges() {
		return Object.keys( this.queues ).length > 0 ||
			Object.keys( this.sent ).length > 0;
	};

	dequeueChangesFor( id: string ) {
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

	processQueue( id: string ) {
		const queue = this.queues[id];

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

		this.store.get( id ).then( ghost => {
			this.compressAndSend( id, ghost );
		} );
	}

	compressAndSend( id: string, ghost: Ghost ) {
		const changes = this.queues[id];
		// the starting point of any changes will be the ghost's current data
		let modifiedObject = ghost.data;

		// a change was sent before we could compress and send
		if ( this.sent[id] ) {
			this.emit( 'wait', id );
			return;
		}

		// there is a single change, remove it from the bucket
		// objects pending queue and send it
		if ( changes.length === 1 ) {
			const change = changes.shift();
			this.sent[id] = change;
			this.emit( 'send', change );
			return;
		}

		// there is more than one change but if the firest change is a delete type
		// then the following local changes can be discarded
		if ( changes.length > 1 && changes[0].type === change_util.type.REMOVE ) {
			const change = changes.shift();
			changes.splice( 0, changes.length - 1 );
			this.sent[id] = change;
			this.emit( 'send', change );
			return;
		}

		while ( changes.length > 0 ) {
			const change = changes.shift();

			if ( change.o === '-' ) {
				changes.unshift( change );
				break;
			}

			if ( change.o === 'M' ) {
				modifiedObject = change_util.apply( change.v, modifiedObject );
			}
		}

		const type = modifiedObject === null ? change_util.type.REMOVE : change_util.type.MODIFY;
		const change = change_util.buildChange( type, id, modifiedObject, ghost );

		this.sent[id] = change;
		this.emit( 'send', change );
	}

	resendSentChanges() {
		for ( let ccid in this.sent ) {
			this.emit( 'send', this.sent[ccid] )
		}
	}
}
