/*eslint no-shadow: 0*/
import { format, inherits } from 'util'
import { EventEmitter } from 'events'
import { parseMessage, parseVersionMessage, change as change_util } from './util'
import JSONDiff from './jsondiff'
import { v4 as uuid } from 'uuid'

const jsondiff = new JSONDiff( {list_diff: false} );

const UNKNOWN_CV = '?';
const CODE_INVALID_VERSION = 405;
const CODE_EMPTY_RESPONSE = 412;
const CODE_INVALID_DIFF = 440;

const operation = {
	MODIFY: change_util.type.MODIFY,
	REMOVE: change_util.type.REMOVE
};

// internal methods used as instance methods on a Channel instance
const internal = {};

/**
 * Updates the currently known synced `cv`.
 *
 * @param {String} cv - the change version synced
 * @returns {Promise<String>} the saved `cv`
 */
internal.updateChangeVersion = function( cv ) {
	return this.store.setChangeVersion( cv ).then( () => {
		// A unit test currently relies on this event, otherwise we can remove it
		this.emit( 'change-version', cv );
		return cv;
	} );
};

/**
 * Called when receive a change from the network. Attempt to apply the change
 * to the ghost object and notify.
 *
 * @param {String} id - id of the object changed
 * @param {Object} change - the change to apply to the object
 */
internal.changeObject = function( id, change ) {
	// pull out the object from the store and apply the change delta
	var applyChange = internal.performChange.bind( this, change );
	this.networkQueue.queueFor( id ).add( function( done ) {
		return applyChange().then( done, done );
	} );
};

/**
 * Creates a change operation for the object of `id` that changes
 * from the date stored in the `ghost` into the data of `object`.
 *
 * Queues the change for syncing.
 *
 * @param {String} id - object id
 * @param {Object} object - object literal of the data that the change should produce
 * @param {Object} ghost - the ghost version used to produce the change object
 */
internal.buildModifyChange = function( id, object, ghost ) {
	var payload = change_util.buildChange( change_util.type.MODIFY, id, object, ghost ),
		empty = true,
		key;

	for ( key in payload.v ) {
		if ( key ) {
			empty = false;
			break;
		}
	}

	if ( empty ) {
		this.emit( 'unmodified', id, object, ghost );
		return;
	}

	// if the change v is an empty object, do not send, notify?
	this.localQueue.queue( payload );
};

/**
 * Creates a change object that deletes an object from a bucket.
 *
 * Queues the change for syncing.
 *
 * @param {String} id - object to remove
 * @param {Object} ghost - current ghost object for the given id
 */
internal.buildRemoveChange = function( id, ghost ) {
	var payload = change_util.buildChange( change_util.type.REMOVE, id, {}, ghost );
	this.localQueue.queue( payload );
};

internal.diffAndSend = function( id, object ) {
	var modify = internal.buildModifyChange.bind( this, id, object );
	return this.store.get( id ).then( modify );
};

internal.removeAndSend = function( id ) {
	var remove = internal.buildRemoveChange.bind( this, id );
	return this.store.get( id ).then( remove );
};

/**
 * Updates the ghost store with the updated ghost data based on the data that
 * comes from applying the patch to the original.
 * 
 * @param { string } id - the bucket object key for the object being updated
 * @param { number } version - the version number the ghost is being updated to
 * @param { Object } data - the new data for the ghost for this version
 * @param { Object } original - the original data for the ghost before patch is applied
 * @param { Object } patch - the patch applied to the original to get the resulting data
 * @param { Object } [acknowledged ] - the change sent by this client matching the received network change
 * @returns { Promise<*> } resolves once the ghost has been updated
 */
internal.updateObjectVersion = function( id, version, data, original, patch, acknowledged ) {
	const save = () => this.store.put( id, version, data );

	if ( acknowledged ) {
		return save().then( () => {
			internal.updateAcknowledged.call( this, acknowledged );
		} );
	}
	// If it's not an ack, it's a change initiated on a different client
	// we need to provide a way for the current client to respond to
	// a potential conflict if it has modifications that have not been synced
	return this.onBeforeNetworkChange( id, data, original, patch )
		.then( ( local ) => {
			// pull all pending changes in the local queue for the object of id
			const localModifications = change_util.diff( original, local ),
				// rebases the local changes on top of the network patch
				transformed = change_util.transform( localModifications, patch, original );

			// remove pending changes
			this.localQueue.dequeueChangesFor( id );

			let update = data;

			// if the rebase operation results in a modified object
			// generate a new patch and queue it to be sent to simperium
			if ( transformed ) {
				const patch = transformed,
					change = change_util.modify( id, version, patch );

				update = jsondiff.apply_object_diff( data, transformed );
				// queue up the new change
				this.localQueue.queue( change );
			}

			return save().then( () => {
				this.emit( 'update', id, update, original, patch, this.isIndexing );
			} );
		}, console.error.bind( console, 'wtf2' ) );
};

internal.removeObject = function( id, acknowledged ) {
	var notify;
	if ( !acknowledged ) {
		notify = this.emit.bind( this, 'remove', id );
	} else {
		notify = internal.updateAcknowledged.bind( this, acknowledged );
	}

	return this.store.remove( id ).then( notify );
};

internal.updateAcknowledged = function( change ) {
	var id = change.id;
	if ( this.localQueue.sent[id] === change ) {
		this.localQueue.acknowledge( change );
		this.emit( 'acknowledge', id, change );
	}
};

internal.performChange = function( change ) {
	var success = internal.applyChange.bind( this, change );
	return this.store.get( change.id ).then( success );
};

internal.findAcknowledgedChange = function( change ) {
	var possibleChange = this.localQueue.sent[change.id];
	if ( possibleChange ) {
		if ( ( change.ccids || [] ).indexOf( possibleChange.ccid ) > -1 ) {
			return possibleChange;
		}
	}
};

internal.requestObjectVersion = function( id, version ) {
	return new Promise( resolve => {
		this.once( `version.${ id }.${ version }`, data => {
			resolve( data );
		} );
		this.send( `e:${ id }.${ version }` );
	} );
};

internal.applyChange = function( change, ghost ) {
	const acknowledged = internal.findAcknowledgedChange.call( this, change ),
		updateChangeVersion = internal.updateChangeVersion.bind( this, change.cv );

	let error,
		original,
		patch,
		modified;
	// attempt to apply the change
	// TODO: Handle errors as specified in
	//	 0:c:[{"ccids": ["0435edf4-3f07-4cc6-bf86-f68e6db8779c"], "id": "9e9a9616-8174-42
	// { ccids: [ '0435edf4-3f07-4cc6-bf86-f68e6db8779c' ],
	//	 id: '9e9a9616-8174-425a-a1b0-9ed5410f1edc',
	//	 clientid: 'node-b9776e96-c068-42ae-893a-03f50833bddb',
	//	 error: 400 }
	if ( change.error ) {
		error = new Error( `${change.error} - Could not apply change to: ${ghost.key}` );
		error.code = change.error;
		error.change = change;
		error.ghost = ghost;
		internal.handleChangeError.call( this, error, change, acknowledged );
		return;
	}

	if ( change.o === operation.MODIFY ) {
		if ( ghost && ( ghost.version !== change.sv ) ) {
			internal.requestObjectVersion.call( this, change.id, change.sv ).then( data => {
				internal.applyChange.call( this, change, { version: change.sv, data } )
			} );
			return;
		}

		original = ghost.data;
		patch = change.v;
		modified = jsondiff.apply_object_diff( original, patch );
		return internal.updateObjectVersion.call( this, change.id, change.ev, modified, original, patch, acknowledged )
			.then( updateChangeVersion );
	} else if ( change.o === operation.REMOVE ) {
		return internal.removeObject.bind( this )( change.id, acknowledged ).then( updateChangeVersion );
	}
}

internal.handleChangeError = function( err, change, acknowledged ) {
	switch ( err.code ) {
		case CODE_INVALID_VERSION:
		case CODE_INVALID_DIFF: // Invalid version or diff, send full object back to server
			if ( ! change.hasSentFullObject ) {
				this.store.get( change.id ).then( object => {
					change.d = object;
					change.hasSentFullObject = true;
					this.localQueue.queue( change );
				} );
			} else {
				this.localQueue.dequeueChangesFor( change.id );
			}

			break;
		case CODE_EMPTY_RESPONSE: // Change causes no change, just acknowledge it
			internal.updateAcknowledged.call( this, acknowledged );
			break;
		default:
			this.emit( 'error', err, change );
	}
}

internal.indexingComplete = function() {
	// Indexing has finished
	this.setIsIndexing( false );

	internal.updateChangeVersion.call( this, this.index_cv )
		.then( () => {
			this.localQueue.start();
		} );

	this.emit( 'index', this.index_cv );

	this.index_last_id = null;
	this.index_cv = null;
	this.emit( 'ready' )
}

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

/**
 * Callback function used by the ghost store to iterate over existing ghosts
 *
 * @callback ghostIterator
 * @param {Ghost} - the current ghost
 */

/**
 * A GhostStore provides the store mechanism for ghost data that the Channel
 * uses to maintain syncing state and producing change operations for
 * Bucket objects.
 *
 * @interface GhostStore
 */

/**
 * Retrieve a Ghost for the given bucket object id
 *
 * @function
 * @name GhostStore#get
 * @param {String} id - bucket object id
 * @returns {Promise<Ghost>} - the ghost for this object
 */

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


/**
 * Maintains syncing state for a Simperium bucket.
 *
 * A bucket uses a channel to listen for updates that come from simperium while
 * sending updates that are made on the client.
 *
 * The channel can handle incoming simperium commands via `handleMessage`. These
 * messages are stripped of their channel number that separates bucket operations.
 * The `Client` maintains which commands should be routed to which channel.
 *
 * The channel is responsible for creating all change operations and downloading
 * bucket data.
 *
 * @param {String} appid - Simperium app id, used for authenticating
 * @param {String} access_token - Simperium user access token
 * @param {GhostStore} store - data storage for ghost objects
 * @param {String} name - the name of the bucket on Simperium.com
 */
export default function Channel( appid, access_token, store, name ) {
	// Uses an event emitter to handle different Simperium  commands
	const message = this.message = new EventEmitter();

	this.name = name;
	this.isIndexing = false;
	this.appid = appid;
	this.store = store;
	this.access_token = access_token;

	this.session_id = 'node-' + uuid();

	// These are the simperium bucket commands the channel knows how to handle
	message.on( 'auth', this.onAuth.bind( this ) );
	message.on( 'i', this.onIndex.bind( this ) );
	message.on( 'c', this.onChanges.bind( this ) );
	message.on( 'e', this.onVersion.bind( this ) );
	message.on( 'cv', this.onChangeVersion.bind( this ) );
	message.on( 'o', function() {} );

	// Maintain a queue of operations that come from simperium commands
	// so that the can be applied to the ghost data.
	this.networkQueue = new NetworkQueue();
	// Maintain a queue of operations that originate from this client
	// to track their status.
	this.localQueue = new LocalQueue( this.store );

	// When a local queue has indicatie that it should send a change operation
	// emit a simperium command. The Client instance will know how to route that
	// command correctly to simperium
	this.localQueue.on( 'send', ( data ) => {
		this.emit( 'send', `c:${ JSON.stringify( data ) }` );
	} );

	// Handle change errors caused by changes originating from this client
	this.localQueue.on( 'error', internal.handleChangeError.bind( this ) );
}

inherits( Channel, EventEmitter );

/**
 * Called by a bucket when a bucket object has been updated.
 *
 * The channel uses this method to initiate change operations when objects are updated.
 *
 * It also uses this method during indexing to track which objects have been successfully
 * downloaded.
 *
 * @param {BucketObject} object - the bucket object
 * @param {Boolean} [sync=true] - if the object should be synced
 * @returns {Promise<BucketObject>} the bucket object
 */
Channel.prototype.update = function( object, sync = true ) {
	this.onBucketUpdate( object.id );
	if ( sync === true ) {
		return internal
			.diffAndSend.call( this, object.id, object.data )
			.then( () => object );
	}
	return Promise.resolve( object );
};

/**
 * Tracks indexing state and emits `indexingStateChange`
 *
 * @private
 * @param {Boolean} isIndexing - updates indexing state to this value
 */
Channel.prototype.setIsIndexing = function( isIndexing ) {
	this.isIndexing = isIndexing;
	this.emit( 'indexingStateChange', this.isIndexing );
}

/**
 * Removes an object from Simperium. Called by a bucket when an object is deleted.
 *
 * @param {String} id - the id of the object to remove
 */
Channel.prototype.remove = function( id ) {
	internal.removeAndSend.call( this, id )
}

/**
 * Retrieves revisions for a given object from Simperium.
 *
 * @typedef {Object} BucketObjectRevision
 * @property {String} id - bucket object id
 * @property {Number} version - revision version
 * @property {Object} data - object literal data at given version
 *
 * @param {String} id - the bucket object id
 * @returns {Promise<Array<BucketObjectRevision>>} list of known object versions
 */
Channel.prototype.getRevisions = function( id ) {
	return new Promise( ( resolve, reject ) => {
		collectionRevisions( this, id, ( error, revisions ) => {
			if ( error ) {
				reject( error );
				return;
			}
			resolve( revisions );
		} );
	} );
}

/**
 * Checks if there are unsynced changes.
 *
 * @returns {Promise<Boolean>} true if there are still changes to sync
 */
Channel.prototype.hasLocalChanges = function() {
	return Promise.resolve( this.localQueue.hasChanges() );
}

/**
 * Retrieves the currently stored version number for a given object
 *
 * @param {String} id - object id to get the version for
 * @returns {Promise<Number>} version number for the object
 */
Channel.prototype.getVersion = function( id ) {
	return this.store.get( id ).then( ( ghost ) => {
		if ( ghost && ghost.version ) {
			return ghost.version;
		}
		return 0;
	} );
}

/**
 * Subscription interface for network changes.
 */
Channel.prototype.subscribe = function( subscriber ) {
	this.subscriber = subscriber;
};

Channel.prototype.onBeforeNetworkChange = function( id, data, base, patch ) {
	if ( this.subscriber ) {
		return Promise.resolve( this.subscriber( id, data, base, patch ) );
	}
	return Promise.resolve();
};

/**
 * Receives incoming messages from Simperium
 *
 * Called by a client that strips the channel number prefix before
 * seding to a specific channel.
 *
 * @param {String} data - the message from Simperium
 */
Channel.prototype.handleMessage = function( data ) {
	var message = parseMessage( data );
	this.message.emit( message.command, message.data );
};

/**
 * Used to send a message from this channel to Simperium
 * The client listens for `send` events and correctly sends them to Simperium
 *
 * @emits Channel#send
 * @private
 * @param {String} data - the message to send
 */
Channel.prototype.send = function( data ) {
	/**
	 * Send event
	 *
	 * @event Channel#send
	 * @type {String} - the message to send to Simperium
	 */
	this.emit( 'send', data );
};

/**
 * Restores a buckets data to what is currently stored in the ghost data.
 */
Channel.prototype.reload = function() {
	this.store.eachGhost( ghost => {
		this.emit( 'update', ghost.key, ghost.data );
	} );
};

/**
 * Called after a bucket updates an object.
 *
 * Wile indexing keeps track of which objects have been retrieved.
 *
 * @param {String} id - object that was updated
 */
Channel.prototype.onBucketUpdate = function( id ) {
	if ( ! this.isIndexing ) {
		return;
	}
	if ( this.index_last_id == null || this.index_cv == null ) {
		return;
	} else if ( this.index_last_id === id ) {
		internal.indexingComplete.call( this );
	}
};

Channel.prototype.onAuth = function( data ) {
	var auth;
	var init;
	try {
		auth = JSON.parse( data );
		this.emit( 'unauthorized', auth );
		return;
	} catch ( error ) {
		// request cv and then send method
		this.once( 'ready', () => {
			this.localQueue.resendSentChanges();
		} )
		init = ( cv ) => {
			if ( cv ) {
				this.localQueue.start();
				this.sendChangeVersionRequest( cv );
			} else {
				this.startIndexing();
			}
		};

		this.store.getChangeVersion().then( init );

		return;
	}
};

/**
 * Re-downloads all Simperium bucket data
 */
Channel.prototype.startIndexing = function() {
	this.localQueue.pause();
	this.setIsIndexing( true );
	this.sendIndexRequest();
};

/**
 * Called when a channel's socket has been connected
 */
Channel.prototype.onConnect = function() {
	var init = {
		name: this.name,
		clientid: this.session_id,
		api: '1.1',
		token: this.access_token,
		app_id: this.appid,
		library: 'node-simperium',
		version: '0.0.1'
	};

	this.send( format( 'init:%s', JSON.stringify( init ) ) );
};

Channel.prototype.onIndex = function( data ) {
	const page = JSON.parse( data ),
		objects = page.index,
		mark		= page.mark,
		cv			= page.current,
		update	= internal.updateObjectVersion.bind( this );

	let objectId;
	objects.forEach( function( object ) {
		objectId = object.id;
		update( object.id, object.v, object.d );
	} );

	if ( !mark ) {
		if ( objectId ) {
			this.index_last_id = objectId;
		}
		if ( !this.index_last_id ) {
			internal.indexingComplete.call( this )
		}
		this.index_cv = cv;
	} else {
		this.sendIndexRequest( mark );
	}
};

Channel.prototype.sendIndexRequest = function( mark ) {
	this.send( format( 'i:1:%s::10', mark ? mark : '' ) );
};

Channel.prototype.sendChangeVersionRequest = function( cv ) {
	this.send( format( 'cv:%s', cv ) );
};

Channel.prototype.onChanges = function( data ) {
	var changes = JSON.parse( data ),
		onChange = internal.changeObject.bind( this );

	changes.forEach( function( change ) {
		onChange( change.id, change );
	} );
	// emit ready after all server changes have been applied
	this.emit( 'ready' );
};

Channel.prototype.onChangeVersion = function( data ) {
	if ( data === UNKNOWN_CV ) {
		this.store.setChangeVersion( null )
			.then( () => this.startIndexing() );
	}
};

Channel.prototype.onVersion = function( data ) {
	// invalid version, give up without emitting
	if ( data.slice( -2 ) === '\n?' ) {
		return;
	}

	const ghost = parseVersionMessage( data );

	this.emit( 'version', ghost.id, ghost.version, ghost.data );
	this.emit( 'version.' + ghost.id, ghost.id, ghost.version, ghost.data );
	this.emit( 'version.' + ghost.id + '.' + ghost.version, ghost.data );
};

function NetworkQueue() {
	this.queues = {};
}

NetworkQueue.prototype.queueFor = function( id ) {
	var queues = this.queues,
		queue = queues[id];

	if ( !queue ) {
		queue = new Queue();
		queue.on( 'finish', function() {
			delete queues[id];
		} );
		queues[id] = queue;
	}

	return queue;
};

function Queue() {
	this.queue = [];
	this.running = false;
}

inherits( Queue, EventEmitter );

// Add a function at the end of the queue
Queue.prototype.add = function( fn ) {
	this.queue.push( fn );
	this.start();
	return this;
};

Queue.prototype.start = function() {
	if ( this.running ) return;
	this.running = true;
	this.emit( 'start' );
	setImmediate( this.run.bind( this ) );
}

Queue.prototype.run = function() {
	var fn;
	this.running = true;

	if ( this.queue.length === 0 ) {
		this.running = false;
		this.emit( 'finish' );
		return;
	}

	fn = this.queue.shift();
	fn( this.run.bind( this ) );
}

function LocalQueue( store ) {
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

		target = jsondiff.apply_object_diff( target, c.v );
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

/**
 * Since revision data is basically immutable we can prevent the
 * need to refetch it after it has been loaded once.
 *
 * E.g. key could be `${ entityId }.${ versionNumber }`
 *
 * @type {Map<String,Object>} stores specific revisions as a cache
 */
export const revisionCache = new Map();

/**
 * Attempts to fetch an entity's revisions
 *
 * By default, a bucket stores two kinds of history:
 * 	- revisions: the most-recent changes to an entity (60 of these)
 * 	- archive: a "snapshot" of every ten revisions (100 of these)
 *
 * Together the revisions and archive span changes over the
 * 1,060 most-recent changes to an entity, but of course once
 * we hit the archive we lose save granularity.
 *
 * Individual buckets can override the defaults as well and also
 * completely eliminate them.
 *
 * We don't have a listing of which revisions exist for a given entity.
 *
 * @param {Object} channel used to send messages to the Simperium server
 * @param {String} id entity id for which to fetch revisions
 * @param {Function} callback called on error or when finished
 */
function collectionRevisions( channel, id, callback ) {
	/** @type {Number} ms delay arbitrarily chosen to give up on fetch */
	const TIMEOUT = 200;

	/** @type {Set} tracks requested revisions */
	const requestedVersions = new Set();

	/** @type {Array<Object>} contains the revisions and associated data */
	const versions = [];

	/** @type {Number} remembers newest version of an entity */
	let latestVersion;

	/** @type {Number} handle for "start finishing" timeout */
	let timeout;

	/**
	 * Receive a version update from the server and
	 * dispatch the next fetch or finish the fetching
	 *
	 * @param {String} id entity id
	 * @param {Number} version version of returned entity
	 * @param {Object} data value of entity at revision
	 */
	function onVersion( id, version, data ) {
		revisionCache.set( `${ id }.${ version }`, data );
		versions.push( { id, version, data } );

		// if we have every possible revision already, finish it!
		// this bypasses any mandatory delay
		if ( versions.length === latestVersion ) {
			finish();
			return;
		}

		fetchNextVersion( version );

		// defer the final response to the application
		clearTimeout( timeout );
		timeout = setTimeout( finish, TIMEOUT );
	}

	/**
	 * Stop listening for versions and stop fetching them
	 * and pass accumulated data back to application
	 */
	function finish() {
		clearTimeout( timeout );
		channel.removeListener( `version.${ id }`, onVersion );

		// sort newest first
		callback( null, versions.sort( ( a, b ) => b.version - a.version ) );
	}

	/**
	 * Find the next version which isn't around and issue
	 * a fetch if possible
	 *
	 * @param {Number} prevVersion starting point for finding next version
	 */
	function fetchNextVersion( prevVersion ) {
		let version = prevVersion;

		// find the next version to request
		// some could have come back already
		// or been requested already
		while ( version > 0 && requestedVersions.has( version ) ) {
			version -= 1;
		}

		// we have them all
		if ( ! version ) {
			return;
		}

		requestedVersions.add( version );

		// fetch from server or local cache
		if ( revisionCache.has( `${ id }.${ version }` ) ) {
			onVersion( id, version, revisionCache.get( `${ id }.${ version }` ) );
		} else {
			channel.send( `e:${ id }.${ version }` );
		}
	}

	// start listening for the responses
	channel.on( `version.${ id }`, onVersion );

	// request the first revision and start the sequence
	// pre-emptively fetch as many as could exist by default
	channel.store.get( id ).then( ( { version } ) => {
		latestVersion = version;

		// grab latest change revisions
		for ( let i = 0; i < 60 && ( version - i ) > 0; i++ ) {
			fetchNextVersion( version - i );
		}

		// grab archive revisions
		// these are like 1, 11, 21, 31, …, 41, normal revisions [42, 43, 44, 45, …]
		const firstArchive = Math.round( ( version - 60 ) / 10 ) * 10 + 1; // 127 -> 67 -> 6 -> 60 -> 61
		for ( let i = 0; i < 100 && ( firstArchive - 10 * i ) > 0; i++ ) {
			fetchNextVersion( firstArchive - 10 * i );
		}
	}, callback );

	// and set an initial timeout for failed connections
	timeout = setTimeout( finish, TIMEOUT * 4 );
}
