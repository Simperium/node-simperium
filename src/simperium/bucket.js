// @flow
import events from 'events'
import { v4 as uuid } from 'uuid';

const { EventEmitter } = events;

type TaskCallback<T> = ( ?Error, ?T ) => void;

/**
 * Convenience function to turn a function that uses a callback into a function
 * that returns a Promise.
 *
 * @param {TaskCallback} task - function that expects a single callback argument
 * @returns {Promise} callback wrapped in a promise interface
 */
const callbackAsPromise = <T>( task: ( TaskCallback<T> ) => void ): Promise<?T> => new Promise( ( resolve, reject ) => {
	task( ( error: ?Error, result: ?T ) => {
		if ( error ) {
			reject( error );
			return;
		}
		resolve( result );
	} );
} );

/**
 * Runs a promise with a callback (if one is provided) to support the old callback API.
 * NOTE: if the callback API is removed this is a place to warn users
 *
 * @param {Function} [callback] - if provided, will be called with the expected values
 * @param {Promise} promise - promise to run, executes callback if provieded
 * @returns {Promise} promise is passed through
 */
const deprecateCallback = <T>( callback: ?TaskCallback<T>, promise: Promise<T> ): Promise<T> => {
	if ( callback ) {
		const perform = callback;
		// Potentially could warn here if we decide to remove callback API
		return promise.then(
			( result ) => {
				perform( null, result );
				return result;
			},
			( error ) => {
				perform( error, null );
				return error;
			}
		);
	}
	return promise;
};

export type BucketObject = {
	id: string,
	data: {},
	isIndexing?: boolean
}

export interface BucketStore {
	/**
	 * Retrieve a bucket object from the store
	 * @function
	 * @name BucketStore#get
	 * @param {String} id - the bucket object id to fetch
	 * @param {bucketStoreGetCallback} - callback once the object is fetched
	 */
	get( id: string, callback: ( ?Error, ?BucketObject ) => void ): void;

	/**
	 * Updates the data for the given object id.
	 *
	 * @function
	 * @name BucketStore#update
	 * @param {String} id - to of object to update
	 * @param {Object} data - data to update the object to
	 * @param {Boolean} isIndexing - indicates the object is being downloaded during an index
	 * @param {bucketStoreGetCallback}
	 */
	 update( id: string, data: {}, isIndexing: boolean, callback: ( ?Error, ?BucketObject ) => void ): void;

	/**
	 * Deletes the object at id from the datastore.
	 *
	 * @function
	 * @name BucketStore#remove
	 * @param {String} id - object to delete from the bucket
	 * @param {bucketStoreRemoveCallback} - called once the object is deleted
	 */
	remove( id: string, callback: ( ?Error ) => void ): void;

	/**
	 * Fetchs all bucket objects from the datastore.
	 *
	 * @function
	 * @name BucketStore#find
	 * @param {?Object} query - currently undefined
	 * @param {bucketStoreFindCallback} - called with results
	 */
	find( query: ?any, callback: ( ?Error, ?BucketObject[] ) => void ): void;
}

type BucketStoreProvider = ( Bucket ) => BucketStore;

export type BucketObjectRevision = {
	id: string,
	version: number,
	data: {}
};

type RevisionList = BucketObjectRevision[];

interface Channel {
	removeListener( eventName: string, listener: ?any ) : Channel;
	on( eventName: string, listener: any ) : Channel;
	reload(): void;
	update( object: BucketObject, sync: boolean ): void;
	remove( id: string ): void;
	hasLocalChanges(): Promise<boolean>;
	getVersion( id: string ): Promise<number>;
	getRevisions( id: string ): Promise<RevisionList>;
}

/**
 * A bucket object represents the data stored in Simperium for the given id
 *
 * @typedef {Object} BucketObject
 * @param {String} id - bucket object id
 * @param {Object} data - object literal of bucket object data stored at the id
 * @param {?Boolean} isIndexing - used to indicate that the bucket is being indexed
 */

/**
 * @callback bucketStoreGetCallback
 * @param {?Error}
 * @param {?BucketObject}
 */
type bucketStoreGetCallback = ( ?Error, ?BucketObject ) => void

/**
 * @callback bucketStoreRemoveCallback
 * @param {?Error}
 */

/**
 * @callback bucketStoreFindCallback
 * @param {?Error}
 * @param {?BucketObject[]}
 */

 interface BucketStoreAPI {
	get: ( id: string ) => Promise<BucketObject>;
	update: ( id: string, data: {}, isIndexing: boolean ) => Promise<BucketObject>;
	remove: ( id: string ) => Promise<void>;
	find: ( query: ?any ) => Promise<BucketObject[]>;
 }
/**
 * Turns existing bucket storage provider callback api into a promise based API
 *
 * @param {BucketStore} store - a bucket storage object
 * @returns {Object} store api methods that use Promises instead of callbacks
 */
const promiseAPI = ( store: BucketStore ): BucketStoreAPI => ( {
	get: id =>
		callbackAsPromise( store.get.bind( store, id ) ),
	update: ( id, object, isIndexing ) =>
		callbackAsPromise( store.update.bind( store, id, object, isIndexing ) ),
	remove: id =>
		callbackAsPromise( store.remove.bind( store, id ) ),
	find: query =>
		callbackAsPromise( store.find.bind( store, query ) )
} );

type updateOptions = { sync: boolean } | bucketStoreGetCallback

export default class Bucket extends EventEmitter {
	name: string;
	store: BucketStore;
	storeAPI: BucketStoreAPI;
	isIndexing: boolean;
	channel: Channel;

	onChannelIndex: any;
	onChannelError: any;
	onChannelUpdate: any;
	onChannelIndexingStateChange: any;
	onChannelRemove: any;

	/**
	 * A bucket that syncs data with Simperium.
	 *
	 * @param {String} name - Simperium bucket name
	 * @param {bucketStoreProvider} storeProvider - a factory function that provides a bucket store
	 * @param {Channel} channel - a channel instance used for syncing Simperium data
	 */
	constructor( name: string, storeProvider: BucketStoreProvider, channel: Channel ) {
		super();
		this.name = name;
		this.store = storeProvider( this );
		this.storeAPI = promiseAPI( this.store );
		this.isIndexing = false;

		/**
		 * Listeners for channel events that will be added to Channel instance
		 */
		this.onChannelIndex = this.emit.bind( this, 'index' );
		this.onChannelError = this.emit.bind( this, 'changeError' );
		this.onChannelUpdate = ( id, data ) => {
			this.update( id, data, { sync: false } );
		};

		this.onChannelIndexingStateChange = ( isIndexing ) => {
			this.isIndexing = isIndexing;
			if ( isIndexing ) {
				this.emit( 'indexing' );
			}
		}

		this.onChannelRemove = ( id ) => this.remove( id );

		if ( channel ) {
			this.setChannel( channel );
		}
	}

	// NOTE: for backwards compatibility, listeners for `error` will
	// be subscribed to `changeError`
	on( eventName: string, listener: Function ): Bucket {
		if ( eventName === 'error' ) {
			// TODO: deprecation warning
			return super.on( 'changeError', listener );
		}
		return super.on( eventName, listener );
	}

	removeListener( eventName: string, listener: Function ): Bucket {
		if ( eventName === 'error' ) {
			// TODO: deprecation warning
			return super.removeListener( 'changeError', listener);
		}
		return super.removeListener( eventName, listener );
	}

	/**
	 * Sets the channel the Bucket will use to sync changes.
	 *
	 * This exists to allow the Client to provide a backwards compatible API. There
	 * is probably no reason to change the Channel once it's already set.
	 *
	 * @param {Channel} channel - channel instance to use for syncing
	 */
	setChannel( channel: Channel ) {
		const existing = this.channel;
		if ( existing ) {
			existing
				.removeListener( 'index', this.onChannelIndex )
				.removeListener( 'changeError', this.onChannelError )
				.removeListener( 'update', this.onChannelUpdate )
				.removeListener( 'indexingStateChange', this.onChannelIndexingStateChange )
				.removeListener( 'remove', this.onChannelRemove );
		}
		this.channel = channel;
		channel
			// forward the index and error events from the channel
			.on( 'index', this.onChannelIndex )
			.on( 'changeError', this.onChannelError )
			// when the channel updates or removes data, the bucket should apply
			// the same updates
			.on( 'update', this.onChannelUpdate )
			.on( 'indexingStateChange', this.onChannelIndexingStateChange )
			.on( 'remove', this.onChannelRemove );
	};

	/**
	 * Reloads all the data from the currently cached set of ghost data
	 */
	reload() {
		this.channel.reload();
	};

	/**
	 * Stores an object in the bucket and syncs it to simperium. Generates an
	 * object ID to represent the object in simperium.
	 *
	 * @param {Object} object - plain js object literal to be saved/synced
	 * @param {?bucketStoreGetCallback} callback - runs when object has been saved
	 * @return {Promise<Object>} data stored in the bucket
	 */
	add( object: {}, callback: ?bucketStoreGetCallback ) {
		const id = uuid();
		return this.update( id, object, callback );
	};

	/**
	 * Requests the object data stored in the bucket for the given id.
	 *
	 * @param {String} id - bucket object id
	 * @param {?bucketStoreGetCallback} callback - with the data stored in the bucket
	 * @return {Promise<Object>} the object id, data and indexing status
	 */
	get( id: string, callback: ?bucketStoreGetCallback ): Promise<BucketObject> {
		return deprecateCallback( callback, this.storeAPI.get( id ) );
	};

	/**
	 * Update the bucket object of `id` with the given data.
	 *
	 * @param {String} id - the bucket id for the object to update
	 * @param {Object} data - object literal to replace the object data with
	 * @param {Object} [options] - optional settings
	 * @param {Boolean} [options.sync=true] - false if object should not be synced with this update
	 * @param {?bucketStoreGetCallback} callback - executed when object is updated localy
	 * @returns {Promise<Object>} - update data
	 */
	update( id: string, data: {}, options: ?updateOptions, callback: ?bucketStoreGetCallback ): Promise<BucketObject> {
		if ( typeof options === 'function' ) {
			callback = options;
			options = { sync: true };
		}

		if ( !! options === false ) {
			options = { sync: true };
		}

		const task = this.storeAPI.update( id, data, this.isIndexing )
			.then( bucketObject => {
				this.emit( 'update', id, bucketObject.data );
				this.channel.update( bucketObject, options ? options.sync : true );
				return bucketObject;
			} );
		return deprecateCallback( callback, task );
	};

	/**
	 * @callback bucketHasLocalChanges
	 * @param {?Error}
	 * @param {?Boolean}
	 */

	/**
	 * Check if the bucket has pending changes that have not yet been synced.
	 *
	 * @param {?bucketHasLocalChanges} callback - optional callback to receive response
	 * @returns {Promise<Boolean>} resolves to true if their are still changes to sync
	 */
	hasLocalChanges( callback: ?( ?Error, ?boolean ) => void ): Promise<boolean> {
		return deprecateCallback( callback, this.channel.hasLocalChanges() );
	};

	/**
	 * @callback bucketGetVersion
	 * @param {?Error}
	 * @param {Number}
	 */

	/**
	 * Gets the currently synced version number for the specified object id.
	 *
	 * A version of `0` indicates that an object has not been added to simperium yet.
	 *
	 * @param {String} id - object to get the version for
	 * @param {?bucketGetVersionCallback} callback - optional callback
	 * @returns {Promise<number>} - resolves to the current synced version
	 */
	getVersion( id: string, callback: ?( ?Error, ?number ) => void ): Promise<number> {
		return deprecateCallback( callback, this.channel.getVersion( id ) );
	};

	/**
	 * Attempts to sync the object specified by `id` using whatever data
	 * is locally stored for the object
	 *
	 * @param {String} id - object to sync
	 * @param {?bucketStoreGetCallback} callback - optional callback
	 * @returns {Promise<Object>} - object id, data
	 */
	touch( id: string, callback: ?bucketStoreGetCallback ): Promise<BucketObject> {
		const task = this.storeAPI.get( id )
			.then( object => this.update( object.id, object.data ) );

		return deprecateCallback( callback, task );
	};

	/**
	 * Deletes the object from the bucket
	 *
	 * @param {String} id - object to delete
	 * @param {?bucketStoreRemoveCallback} callback - optional callback
	 * @returns {Promise<Void>} - resolves when object has been deleted
	 */
	remove( id: string, callback: ?( ?Error, ?void ) => void ): Promise<void> {
		const task = this.storeAPI.remove( id )
			.then( ( result ) => {
				this.emit( 'remove', id );
				this.channel.remove( id );
				return result;
			} )
		return deprecateCallback( callback, task );
	};

	find( query: ?any, callback: ?( ?Error, ?BucketObject[] ) => void ): Promise<BucketObject[]> {
		return deprecateCallback( callback, this.storeAPI.find( query ) );
	};

	/**
	 * Gets all known past versions of an object
	 *
	 * @param {String} id - object to fetch revisions for
	 * @param {Function} [callback] - optional callback
	 * @returns {Promise<Array<Object>>} - list of objects with id, data and version
	 */
	getRevisions( id: string, callback: ?( ?Error, ?RevisionList ) => void ): Promise<RevisionList> {
		return deprecateCallback( callback, this.channel.getRevisions( id ) );
	}
}
