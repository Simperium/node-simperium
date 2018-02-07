import { EventEmitter } from 'events'
import { inherits } from 'util'
import { v4 as uuid } from 'uuid';

const callbackAsPromise = ( callback, task ) => new Promise( ( resolve, reject ) => {
	task( ( error, result ) => {
		if ( error ) {
			reject( error );
			return;
		}
		resolve( result );
	} );
} );

const deprecateCallback = ( callback, promise ) => {
	if ( typeof callback === 'function' ) {
		// TODO: warn about deprecating callback API
		// and convert to promises
		return promise.then(
			result => {
				callback( null, result );
				return result;
			},
			error => {
				callback( error );
				return error;
			}
		);
	}
	return promise;
};

const promiseAPI = store => ( {
	get: ( id, callback ) =>
		callbackAsPromise( callback, store.get.bind( store, id ) ),
	update: ( id, object, isIndexing, callback ) =>
		callbackAsPromise( callback, store.update.bind( store, id, object, isIndexing ) ),
	remove: ( id, callback ) =>
		callbackAsPromise( callback, store.remove.bind( store, id ) ),
	find: ( query, callback ) =>
		callbackAsPromise( callback, store.find.bind( store, query ) )
} );

export default function Bucket( name, storeProvider, channel ) {
	EventEmitter.call( this );
	this.name = name;
	this.store = storeProvider( this );
	this.storeAPI = promiseAPI( this.store );
	this.isIndexing = false;
	this.channel = channel;

	channel
		// forward the index and error events from the channel
		.on( 'index', ( ... args ) => this.emit( 'index', ... args ) )
		.on( 'error', ( ... args ) => this.emit( 'error', ... args ) )
		// when the channel updates or removes data, the bucket should apply
		// the same updates
		.on( 'update', ( id, data ) => {
			this.update( id, data, { sync: false } );
		} )
		.on( 'indexingStateChange', ( isIndexing ) => {
			this.isIndexing = isIndexing;
			if ( isIndexing ) {
				this.emit( 'indexing' );
			}
		} )
		.on( 'remove', ( id ) => {
			// TODO, there needs te be a way to remove without telling the
			// channel to do it
			this.remove( id );
		} );
}

inherits( Bucket, EventEmitter );

Bucket.prototype.reload = function() {
	this.channel.reload();
};

/**
 * Stores an object in the bucket and syncs it to simperium. Generates an
 * object ID to represent the object in simperium.
 *
 * @param {Object} object - plain js object literal to be saved/synced
 * @param {Function} callback - runs when object has been saved
 * @return {Promise<Object>} data stored in the bucket
 */
Bucket.prototype.add = function( object, callback ) {
	var id = uuid();
	return this.update( id, object, callback );
};

/**
 * Requests the object data stored in the bucket for the given id.
 *
 * @param {String} id - bucket object id
 * @param {Function} callback - with the data stored in the bucket
 * @return {Promise<Object>} the object data for the given id
 */
Bucket.prototype.get = function( id, callback ) {
	return deprecateCallback( callback, this.storeAPI.get( id ) );
};

/**
 * Update the bucket object of `id` with the given data.
 *
 * @param {String} id - the bucket id for the object to update
 * @param {Object} data - object literal to replace the object data with
 * @param {Object} [options] - optional settings
 * @param {Boolean} [options.sync=true] - false if object should not be synced with this update
 * @param {Function} callback - executed when object is updated localy
 * @returns {Promise<Object>} - update data
 */
Bucket.prototype.update = function( id, data, options, callback ) {
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
			this.channel.update( bucketObject, options.sync );
			return bucketObject;
		} );
	return deprecateCallback( callback, task );
};

Bucket.prototype.hasLocalChanges = function( callback ) {
	return deprecateCallback( callback, this.channel.hasLocalChanges() );
};

Bucket.prototype.getVersion = function( id, callback ) {
	return deprecateCallback( callback, this.channel.getVersion( id ) );
};

Bucket.prototype.touch = function( id, callback ) {
	const task = this.storeAPI.get( id )
		.then( object => this.update( object.id, object.data ) );

	return deprecateCallback( callback, task );
};

Bucket.prototype.remove = function( id, callback ) {
	const task = this.storeAPI.remove( id )
		.then( ( result ) => {
			this.emit( 'remove', id );
			this.channel.remove( id );
			return result;
		} )
	return deprecateCallback( callback, task );
};

Bucket.prototype.find = function( query, callback ) {
	return deprecateCallback( callback, this.storeAPI.find( query ) );
};

Bucket.prototype.getRevisions = function( id, callback ) {
	return deprecateCallback( callback, this.channel.getRevisions( id ) );
}
