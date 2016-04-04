export default function Store( bucket ) {
	this.bucket = bucket;
	this.index = {};
}

Store.prototype.getChangeVersion = function() {
	return new Promise( ( resolve ) => {
		setImmediate( () => {
			resolve( this.cv );
		} );
	} );
};

Store.prototype.setChangeVersion = function( cv ) {
	return new Promise( ( resolve ) => {
		setImmediate( () => {
			this.cv = cv;
			resolve( cv );
		} );
	} );
};

Store.prototype.put = function( id, version, data ) {
	return new Promise( ( resolve ) => {
		setImmediate( () => {
			this.index[id] = JSON.stringify( {version: version, data: data} );
			resolve( true );
		} );
	} );
};

Store.prototype.get = function( id ) {
	return new Promise( ( resolve ) => {
		setImmediate( () => {
			var ghost = this.index[id];
			if ( !ghost ) {
				ghost = {data: {}};
				ghost.key = id;
				this.index[id] = JSON.stringify( ghost );
			} else {
				ghost = JSON.parse( ghost );
			}
			resolve( ghost );
		} );
	} );
};

Store.prototype.remove = function( id ) {
	return new Promise( ( resolve ) => {
		setImmediate( () => {
			delete this.index[id];
			resolve();
		} );
	} );
};
