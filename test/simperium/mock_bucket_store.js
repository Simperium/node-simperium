
function BucketStore() {
	this.objects = {};
}

BucketStore.prototype.get = function( id, callback ) {
	var objects = this.objects;

	setImmediate( function() {
		const data = objects[id];
		if ( data ) {
			callback( null, { id, data } );
			return;
		}
		callback( null, null );
	} );
};

BucketStore.prototype.update = function( id, object, isIndexing, callback ) {
	this.objects[id] = object;
	setImmediate( function() {
		if ( callback ) callback( null, {id: id, data: object, isIndexing: isIndexing} );
	} );
};

BucketStore.prototype.remove = function( id, callback ) {
	delete this.objects[id];
	setImmediate( function() {
		callback( null );
	} );
};

export default () => new BucketStore();
