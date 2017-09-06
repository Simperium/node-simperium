/*eslint no-shadow: 0*/
import { format, inherits } from 'util'
import { EventEmitter } from 'events'
import { parseMessage, parseVersionMessage, change as change_util } from './util'
import JSONDiff from './jsondiff'
import uuid from 'node-uuid'

const jsondiff = new JSONDiff( {list_diff: false} );

const UNKNOWN_CV = '?';
const CODE_INVALID_VERSION = 405;
const CODE_EMPTY_RESPONSE = 412;
const CODE_INVALID_DIFF = 440;

var operation = {
	MODIFY: 'M',
	REMOVE: '-'
};

var internal = {};

internal.updateChangeVersion = function( cv ) {
	return this.store.setChangeVersion( cv );
};

// Called when receive a change from the network. Attempt to apply the change
// to the ghost object and notify.
internal.changeObject = function( id, change ) {
	// pull out the object from the store and apply the change delta
	var applyChange = internal.performChange.bind( this, change );

	this.networkQueue.queueFor( id ).add( function( done ) {
		return applyChange().then( done, done );
	} );
};

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

	if ( empty ) return this.emit( 'unmodified', id, object, ghost );

	// if the change v is an empty object, do not send, notify?
	this.localQueue.queue( payload );
};

internal.buildRemoveChange = function( id, object, ghost ) {
	var payload = change_util.buildChange( change_util.type.REMOVE, id, object, ghost );
	this.localQueue.queue( payload );
};

internal.sendChange = function( data ) {
	this.emit( 'send', format( 'c:%s', JSON.stringify( data ) ) );
};

internal.diffAndSend = function( id, object ) {
	var modify = internal.buildModifyChange.bind( this, id, object );
	return this.store.get( id ).then( modify );
};

internal.removeAndSend = function( id, object ) {
	var remove = internal.buildRemoveChange.bind( this, id, object );
	return this.store.get( id ).then( remove );
};

// We've receive a full object from the network. Update the local instance and
// notify of the new object version
internal.updateObjectVersion = function( id, version, data, original, patch, acknowledged ) {
	var notify,
		changes,
		change,
		patch,
		localModifications,
		remoteModifications,
		transformed,
		update;
	// If it's not an ack, it's a change initiated on a different client
	// we need to provide a way for the current client to respond to
	// a potential conflict if it has modifications that have not been synced
	if ( !acknowledged ) {
		changes = this.localQueue.dequeueChangesFor( id );
		localModifications = change_util.compressChanges( changes, original );
		remoteModifications = patch;
		transformed = change_util.transform( localModifications, remoteModifications, original );
		update = data;

		// apply the transformed patch and emit the update
		if ( transformed ) {
			patch = transformed;
			update = jsondiff.apply_object_diff( data, transformed );
			// queue up the new change
			change = change_util.modify( id, version, patch );
			this.localQueue.queue( change );
		}

		notify = this.emit.bind( this, 'update', id, update, original, patch, this.bucket.isIndexing );
	} else {
		notify = internal.updateAcknowledged.bind( this, acknowledged );
	}

	return this.store.put( id, version, data ).then( notify );
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
	var acknowledged = internal.findAcknowledgedChange.bind( this )( change ),
		error,
		emit,
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

	emit = this.emit.bind( this, 'change-version', change.cv, change );

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
		return internal.updateObjectVersion.bind( this )( change.id, change.ev, modified, original, patch, acknowledged )
			.then( emit );
	} else if ( change.o === operation.REMOVE ) {
		return internal.removeObject.bind( this )( change.id, acknowledged ).then( emit );
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
	this.bucket.isIndexing = false;
	this.emit( 'index', this.index_cv );

	this.index_last_id = null;
	this.index_cv = null;
	this.bucket.removeListener( 'update', this.bucketUpdateListener );
	this.emit( 'ready' )
}

export default function Channel( appid, access_token, bucket, store ) {
	var channel = this;
	var message = this.message = new EventEmitter();
	var bucketEvents = new EventEmitter(),
		update = bucket.update,
		remove = bucket.remove;

	this.appid = appid;
	this.bucket = bucket;
	this.store = store;
	this.access_token = access_token;

	this.session_id = 'node-' + uuid.v4();

	message.on( 'auth', this.onAuth.bind( this ) );
	message.on( 'i', this.onIndex.bind( this ) );
	message.on( 'c', this.onChanges.bind( this ) );
	message.on( 'e', this.onVersion.bind( this ) );
	message.on( 'cv', this.onChangeVersion.bind( this ) );
	message.on( 'o', function() {} );

	this.networkQueue = new NetworkQueue();
	this.localQueue = new LocalQueue( this.store );

	this.localQueue.on( 'send', internal.sendChange.bind( this ) );
	this.localQueue.on( 'error', internal.handleChangeError.bind( this ) );

	this.on( 'index', function( cv ) {
		internal.updateChangeVersion.call( channel, cv ).then( function() {
			channel.localQueue.start();
		} );
		bucket.emit( 'index' );
	} );

	// forward errors to bucket instance
	this.on( 'error', bucket.emit.bind( bucket, 'error' ) )

	bucket.update = function( id, object, options, callback ) {
		if ( typeof options === 'function' ) {
			callback = options;
			options = { sync: true };
		}

		if ( !!options === false ) {
			options = { sync: true };
		}

		return update.call( bucket, id, object, options, function( err, object ) {
			if ( !err ) bucket.emit( 'update', id, object.data );
			if ( !err && options.sync !== false ) bucketEvents.emit( 'update', id, object.data );
			if ( callback ) callback.apply( this, arguments );
		} );
	};

	bucket.remove = function( id, callback ) {
		return remove.call( bucket, id, function( err ) {
			if ( !err ) bucketEvents.emit( 'remove', id );
			if ( callback ) callback.apply( this, arguments );
		} );
	};

	bucket.getRevisions = function( id, callback ) {
		collectionRevisions( channel, id, callback );
	};

	bucketEvents
		.on( 'update', internal.diffAndSend.bind( this ) )
		.on( 'remove', internal.removeAndSend.bind( this ) );

	// when the network sends in an update or remove, update the bucket data
	this
		.on( 'update', function( id, data ) {
			var args = [].slice.call( arguments );
			update.call( bucket, id, data, {sync: false}, function() {
				bucket.emit.apply( bucket, ['update'].concat( args ) );
			} );
		} )
		.on( 'remove', function( id ) {
			remove.call( bucket, id, function() {
				bucket.emit( 'remove', id );
			} );
		} );

	bucket.on( 'reload', this.onReload.bind( this ) );
	this.bucketUpdateListener = this.onBucketUpdate.bind( this );
	bucket.on( 'update', this.bucketUpdateListener );

	this.on( 'change-version', internal.updateChangeVersion.bind( this ) );
}

inherits( Channel, EventEmitter );

Channel.prototype.handleMessage = function( data ) {
	var message = parseMessage( data );
	this.message.emit( message.command, message.data );
};

Channel.prototype.send = function( data ) {
	this.emit( 'send', data );
};

Channel.prototype.onReload = function() {
	var emit = this.emit.bind( this, 'update' );
	this.store.eachGhost( function( ghost ) {
		emit( ghost.key, ghost.data );
	} );
};

Channel.prototype.onBucketUpdate = function( noteId ) {
	if ( this.index_last_id == null || this.index_cv == null ) {
		return;
	} else if ( this.index_last_id === noteId ) {
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

Channel.prototype.startIndexing = function() {
	this.localQueue.pause();
	this.bucket.isIndexing = true;
	this.bucket.emit( 'indexing' );
	this.sendIndexRequest();
};

Channel.prototype.onConnect = function() {
	var init = {
		name: this.bucket.name,
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
	var page = JSON.parse( data ),
		objects = page.index,
		mark		= page.mark,
		cv			= page.current,
		update	= internal.updateObjectVersion.bind( this );

	var objectId;
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

	var ghost = parseVersionMessage( data );

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
}
;

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
			return finish();
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

