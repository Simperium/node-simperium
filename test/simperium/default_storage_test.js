import { deepEqual } from 'assert'
import Bucket from '../../src/simperium/bucket'
import defaultStore from '../../src/simperium/storage/default'
import { MockChannel } from './mock-channel';

describe( 'default store', () => {
	let bucket;

	beforeEach( () => {
		bucket = new Bucket( 'things', defaultStore, new MockChannel() );
	} )

	it( 'should store object update', () => {
		const id = 'thing',
			data = {one: 'two'};

		return bucket.update( id, data )
			.then( () => bucket.get( id ) )
			.then( ( object ) => {
				deepEqual( object, { data, id } );
			} );
	} );

	it( 'should update with options', () => {
		const id = 'thing',
			data = {one: 'two'}

		return bucket.update( id, data )
			.then( () => bucket.get( id ) )
			.then( ( object ) => {
				deepEqual( object, { data, id } );
			} );
	} );
} );
