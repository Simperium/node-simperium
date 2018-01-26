import { EventEmitter } from 'events'
import { inherits } from 'util'
import uuid from 'node-uuid';

export default function Bucket( name, storeProvider ) {
	EventEmitter.call( this );
	this.name = name;
	this.store = storeProvider( this );
	this.isIndexing = false;
}

inherits( Bucket, EventEmitter );

Bucket.prototype.reload = function() {
	this.emit( 'reload' );
};

Bucket.prototype.add = function( object, callback ) {
	var id = uuid.v4();
	return this.update( id, object, callback );
};

Bucket.prototype.get = function( id, callback ) {
	return this.store.get( id, callback );
};

Bucket.prototype.update = function( id, data, options, callback ) {
	if ( typeof options === 'function' ) {
		callback = options;
	}
	return this.store.update( id, data, this.isIndexing, callback );
};

Bucket.prototype.getVersion = function( id, callback ) {
	callback( null, 0 );
};

Bucket.prototype.touch = function( id, callback ) {
	return this.store.get( id, ( e, object ) => {
		if ( e ) return callback( e );
		this.update( object.id, object.data, callback );
	} );
};

Bucket.prototype.remove = function( id, callback ) {
	return this.store.remove( id, callback );
};

Bucket.prototype.find = function( query, callback ) {
	return this.store.find( query, callback );
};

Bucket.prototype.getRevisions = function( id, callback ) {
	// Overridden in Channel
	callback( new Error( 'Failed to fetch revisions for' + id ) );
}
