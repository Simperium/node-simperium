export default function() {
	return new BucketStore();
};

function BucketStore() {
	this.objects = {};
}

BucketStore.prototype.get = function( id, callback ) {
	callback( null, {id: id, data: this.objects[id]} );
};

BucketStore.prototype.update = function( id, object, callback ) {
	this.objects[id] = object;
	callback( null, {id: id, data: object} );
};

BucketStore.prototype.remove = function( id, callback ) {
	delete this.objects[id];
	callback( null );
};

// TODO: build a query interface
BucketStore.prototype.find = function( query, callback ) {
	var objects = [];
	var key;
	for ( key in this.objects ) {
		objects.push( {id: key, data: this.objects[key] } );
	}
	callback( null, objects );
}
