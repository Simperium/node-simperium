// @flow

import type { BucketStore, BucketObject } from '../../src/simperium/bucket';

class MockStore implements BucketStore  {
	objects: { [string]: BucketObject };

	constructor() {
		this.objects = {};
	}

	get( id: string, callback: Function ) {
		var objects = this.objects;
		setImmediate( function() {
			callback( null, objects[id] );
		} );
	}

	update( id: string, object: {}, isIndexing: boolean, callback: Function ) {
		setImmediate( () => {
			let updated = this.objects[id] = {id: id, data: object, isIndexing: isIndexing};
			if ( callback ) callback( null, updated );
		} );
	}

	remove( id: string, callback: Function ) {
		setImmediate( () => {
			delete this.objects[id];
			callback( null );
		} );
	}

	find() {
		throw new Error( 'not implemeted' );
	}
}

export default () => new MockStore();
