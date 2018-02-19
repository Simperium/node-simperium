// @flow
/*eslint no-shadow: 0*/
import { format, inherits } from 'util'
import events from 'events'
import { parseMessage, parseVersionMessage, change as change_util } from './util'
import JSONDiff from './jsondiff'
import { v4 as uuid } from 'uuid'
import type { BucketObjectRevision, BucketObject } from './bucket';
import { LocalQueue, NetworkQueue } from './queues';

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
type Ghost = { version: number, key: string, data: {} }

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
export interface GhostStore {

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
	put( id: string, version: number, data: {} ): Promise<Ghost>;

	/**
	 * Delete a Ghost from the store.
	 *
	 * @function
	 * @name GhostStore#remove
	 * @param {String} id - bucket object id
	 * @returns {Promise<Ghost>} - the ghost for this object
	 */
	remove( id: string ): Promise<Ghost>;

	/**
	 * Iterate over existing Ghost objects with the given callback.
	 *
	 * @function
	 * @name GhostStore#eachGhost
	 * @param {ghostIterator} - function to run against each ghost
	 */
	eachGhost( ghostIterator: Ghost => void ): void;

	/**
	 * Get the current change version (cv) that this channel has synced.
	 *
	 * @function
	 * @name GhostStore#getChangeVersion
	 * @returns {Promise<String>} - the current change version for the bucket
	 */
	getChangeVersion(): Promise<string>;

	/**
	 * Set the current change version.
	 *
	 * @function
	 * @name GhostStore#setChangeVersion
	 * @param {String} changeVersion - the new version no set
	 * @returns {Promise<Void>} - resolves once the change version is saved
	 */
	setChangeVersion( changeVersion: ?string ): Promise<void>;
}

const { EventEmitter } = events;

const jsondiff = new JSONDiff( {list_diff: false} );

const UNKNOWN_CV = '?';
const CODE_INVALID_VERSION = 405;
const CODE_EMPTY_RESPONSE = 412;
const CODE_INVALID_DIFF = 440;

type Modify = 'M';
type Remove = '-';
type OperationType = Modify | Remove;

const operation: { [string]: OperationType } = {
	MODIFY: 'M',
	REMOVE: '-'
};

type Change = { id: string };

const updateAcknowledged = ( channel: Channel, change: Change ) => {
	const id = change.id;
	if ( channel.localQueue.sent[id] === change ) {
		channel.localQueue.acknowledge( change );
		channel.emit( 'acknowledge', id, change );
	}
};

const requestObjectVersion = ( channel: Channel, id: string, version: number ): Promise<any> => {
	return new Promise( resolve => {
		channel.once( `version.${ id }.${ version }`, ( data: any ) => {
			resolve( data );
		} );
		channel.send( `e:${ id }.${ version }` );
	} );
};

const handleChangeError = ( channel, err, change, acknowledged ) => {
	switch ( err.code ) {
		case CODE_INVALID_VERSION:
		case CODE_INVALID_DIFF: // Invalid version or diff, send full object back to server
			if ( ! change.hasSentFullObject ) {
				channel.store.get( change.id ).then( object => {
					change.d = object;
					change.hasSentFullObject = true;
					channel.localQueue.queue( change );
				} );
			} else {
				channel.localQueue.dequeueChangesFor( change.id );
			}

			break;
		case CODE_EMPTY_RESPONSE: // Change causes no change, just acknowledge it
			updateAcknowledged( channel, acknowledged );
			break;
		default:
			channel.emit( 'changeError', err, change );
	}
}

/**
 * Updates the currently known synced `cv`.
 *
 * @param {Channel} channel - channel to perform operation on
 * @param {String} cv - the change version synced
 * @returns {Promise<String>} the saved `cv`
 */
const updateChangeVersion = ( channel: Channel, cv: ?string ) => {
	return channel.store.setChangeVersion( cv ).then( () => {
		// A unit test currently relies on this event, otherwise we can remove it
		channel.emit( 'change-version', cv );
		return cv;
	} );
};

const findAcknowledgedChange = ( channel: Channel, change: Change ) => {
	const possibleChange = channel.localQueue.sent[change.id];
	if ( possibleChange ) {
		if ( ( change.ccids || [] ).indexOf( possibleChange.ccid ) > -1 ) {
			return possibleChange;
		}
	}
};

const removeObject = ( channel: Channel, id: string, acknowledged: Change ) => {
	let notify;
	if ( !acknowledged ) {
		notify = () => {
			channel.emit( 'remove', id );
		}
	} else {
		notify = () => {
			updateAcknowledged( channel, acknowledged );
		}
	}

	return channel.store.remove( id ).then( notify );
};

// We've receive a full object from the network. Update the local instance and
// notify of the new object version
const updateObjectVersion = ( channel: Channel, id: string, version: number, data: {}, original, patch, acknowledged ) => {
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
		changes = channel.localQueue.dequeueChangesFor( id );
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
			channel.localQueue.queue( change );
		}

		notify = () => {
			channel.emit( 'update', id, update, original, patch, channel.isIndexing );
		}
	} else {
		notify = () => {
			updateAcknowledged( channel, acknowledged );
		}
	}

	return channel.store.put( id, version, data ).then( notify );
};

const applyChange = ( channel: Channel, change: Change, ghost: Ghost ) => {
	const acknowledged = findAcknowledgedChange( channel, change );

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
		handleChangeError( channel, error, change, acknowledged );
		return;
	}

	if ( change.o === operation.MODIFY ) {
		if ( ghost && ( ghost.version !== change.sv ) ) {
			requestObjectVersion( channel, change.id, change.sv ).then( data => {
				applyChange( channel, change, { version: change.sv, data } )
			} );
			return;
		}

		original = ghost.data;
		patch = change.v;
		modified = jsondiff.apply_object_diff( original, patch );
		return updateObjectVersion( channel, change.id, change.ev, modified, original, patch, acknowledged )
			.then( () => {
				return updateChangeVersion( channel, change.cv );
			} );
	} else if ( change.o === operation.REMOVE ) {
		return removeObject( channel, change.id, acknowledged ).then( () => {
			return updateChangeVersion( channel, change.cv );
		} );
	}
}

/**
 * Called when receive a change from the network. Attempt to apply the change
 * to the ghost object and notify.
 *
 * @param {Channel} channel - channel to apply change
 * @param {String} id - id of the object changed
 * @param {Object} change - the change to apply to the object
 */
const changeObject = ( channel, id, change ) => {
	channel.networkQueue.queueFor( id ).add( ( done ) => {
		channel.store.get( id )
			.then(
				ghost => {
					applyChange( channel, change, ghost );
					done();
				},
				done
			);
	} );
};

/**
 * Creates a change operation for the object of `id` that changes
 * from the date stored in the `ghost` into the data of `object`.
 *
 * Queues the change for syncing.
 *
 * @param {Channel} channel -
 * @param {String} id - object id
 * @param {Object} object - object literal of the data that the change should produce
 * @param {Object} ghost - the ghost version used to produce the change object
 */
const buildModifyChange = ( channel, id, object, ghost ) => {
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
		channel.emit( 'unmodified', id, object, ghost );
		return;
	}

	// if the change v is an empty object, do not send, notify?
	channel.localQueue.queue( payload );
};

/**
 * Creates a change object that deletes an object from a bucket.
 *
 * Queues the change for syncing.
 *
 * @param {String} id - object to remove
 * @param {Object} ghost - current ghost object for the given id
 */
const buildRemoveChange = ( channel, id, ghost ) => {
	let payload = change_util.buildChange( change_util.type.REMOVE, id, {}, ghost );
	channel.localQueue.queue( payload );
};

const diffAndSend = ( channel, id, object ) => {
	return channel.store.get( id ).then( ghost => {
		buildModifyChange( channel, id, object, ghost )
	} );
};

const removeAndSend = ( channel, id ) => {
	return channel.store.get( id ).then( ghost => {
		buildRemoveChange( channel, id, ghost );
	} );
};

const indexingComplete = ( channel ) => {
	// Indexing has finished
	channel.setIsIndexing( false );

	updateChangeVersion( channel, channel.index_cv )
		.then( () => {
			channel.localQueue.start();
		} );

	channel.emit( 'index', channel.index_cv );

	channel.index_last_id = null;
	channel.index_cv = null;
	channel.emit( 'ready' )
}

export default class Channel extends EventEmitter {
	appid: string
	name: string
	isIndexing: boolean
	access_token: string
	store: GhostStore
	session_id: string
	message: EventEmitter

	networkQueue: NetworkQueue
	localQueue: LocalQueue

	index_last_id: ?string
	index_cv: ?string

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
	constructor( appid: string, access_token: string, store: GhostStore, name: string ) {
		super();
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

		// When a local queue has indicated that it should send a change operation
		// emit a simperium command. The Client instance will know how to route that
		// command correctly to simperium
		this.localQueue.on( 'send', ( data ) => {
			this.emit( 'send', `c:${ JSON.stringify( data ) }` );
		} );

		// Handle change errors caused by changes originating from this client
		this.localQueue.on( 'error', handleChangeError.bind( null, this ) );		
	}

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
	 */
	update( object: BucketObject, sync: boolean = true ) {
		this.onBucketUpdate( object.id );
		if ( sync === true ) {
			diffAndSend( this, object.id, object.data );
		}
	};

	/**
	 * Tracks indexing state and emits `indexingStateChange`
	 *
	 * @private
	 * @param {Boolean} isIndexing - updates indexing state to this value
	 */
	setIsIndexing( isIndexing: boolean ) {
		this.isIndexing = isIndexing;
		this.emit( 'indexingStateChange', this.isIndexing );
	}

	/**
	 * Removes an object from Simperium. Called by a bucket when an object is deleted.
	 *
	 * @param {String} id - the id of the object to remove
	 */
	remove( id: string ) {
		removeAndSend( this, id )
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
	getRevisions( id: string ): Promise<BucketObjectRevision[]> {
		return new Promise( ( resolve, reject ) => {
			collectionRevisions( this, id, ( error, revisions ) => {
				if ( error ) {
					reject( error );
					return;
				}
				if ( revisions ) {
					resolve( revisions );
				}
			} );
		} );
	}

	/**
	 * Checks if there are unsynced changes.
	 *
	 * @returns {Promise<Boolean>} true if there are still changes to sync
	 */
	hasLocalChanges(): Promise<boolean> {
		return Promise.resolve( this.localQueue.hasChanges() );
	}

	/**
	 * Retrieves the currently stored version number for a given object
	 *
	 * @param {String} id - object id to get the version for
	 * @returns {Promise<Number>} version number for the object
	 */
	getVersion( id: string ): Promise<number> {
		return this.store.get( id ).then( ( ghost ) => {
			if ( ghost && ghost.version ) {
				return ghost.version;
			}
			return 0;
		} );
	}

	/**
	 * Receives incoming messages from Simperium
	 *
	 * Called by a client that strips the channel number prefix before
	 * seding to a specific channel.
	 *
	 * @param {String} data - the message from Simperium
	 */
	handleMessage( data: string ) {
		const message = parseMessage( data );
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
	send( data: string ) {
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
	reload() {
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
	onBucketUpdate( id: string ) {
		if ( ! this.isIndexing ) {
			return;
		}
		if ( this.index_last_id == null || this.index_cv == null ) {
			return;
		} else if ( this.index_last_id === id ) {
			indexingComplete( this );
		}
	};

	onAuth( data: string ) {
		let auth;
		let init;
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
	startIndexing() {
		this.localQueue.pause();
		this.setIsIndexing( true );
		this.sendIndexRequest();
	};

	/**
	 * Called when a channel's socket has been connected
	 */
	onConnect() {
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

	onIndex( data: string ) {
		const page = JSON.parse( data ),
			objects = page.index,
			mark		= page.mark,
			cv			= page.current;

		let objectId;
		objects.forEach( ( object ) => {
			objectId = object.id;
			updateObjectVersion( this, object.id, object.v, object.d );
		} );

		if ( !mark ) {
			if ( objectId ) {
				this.index_last_id = objectId;
			}
			if ( !this.index_last_id ) {
				indexingComplete( this );
			}
			this.index_cv = cv;
		} else {
			this.sendIndexRequest( mark );
		}
	};

	sendIndexRequest( mark: ?string ) {
		this.send( format( 'i:1:%s::10', mark ? mark : '' ) );
	};

	sendChangeVersionRequest( cv: string ) {
		this.send( format( 'cv:%s', cv ) );
	};

	onChanges( data: string ) {
		const changes: any[] = JSON.parse( data );

		changes.forEach( ( change: any ) => {
			changeObject( this, change.id, change );
		} );
		// emit ready after all server changes have been applied
		this.emit( 'ready' );
	};

	onChangeVersion( data: string ) {
		if ( data === UNKNOWN_CV ) {
			this.store.setChangeVersion( null )
				.then( () => this.startIndexing() );
		}
	}

	onVersion( data: string ) {
		// invalid version, give up without emitting
		if ( data.slice( -2 ) === '\n?' ) {
			return;
		}

		const ghost = parseVersionMessage( data );

		this.emit( 'version', ghost.id, ghost.version, ghost.data );
		this.emit( 'version.' + ghost.id, ghost.id, ghost.version, ghost.data );
		this.emit( 'version.' + ghost.id + '.' + ghost.version, ghost.data );
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
export const revisionCache: Map<string, {}> = new Map();

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
function collectionRevisions( channel: Channel, id: string, callback: ( ?Error, ?BucketObjectRevision[] ) => void ) {
	/** @type {Number} ms delay arbitrarily chosen to give up on fetch */
	const TIMEOUT = 200;

	/** @type {Set} tracks requested revisions */
	const requestedVersions: Set<number> = new Set();

	/** @type {Array<Object>} contains the revisions and associated data */
	const versions: BucketObjectRevision[] = [];

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
	function onVersion( id: string, version: number, data: {} ) {
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

		let cached = revisionCache.get( `${ id }.${ version }` );
		if ( cached ) {
			onVersion( id, version, cached );
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
