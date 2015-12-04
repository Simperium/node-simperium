import Bucket from 'simperium/bucket'
import assert from 'assert'
import storeProvider from './mock_bucket_store'

describe( 'Bucket', function() {
	var bucket, store;

	beforeEach( function() {
		bucket = new Bucket( 'things', storeProvider );
		store = bucket.store;
	} );

	it( 'should fetch object data', function( done ) {
		var object = {title: 'hi'};
		store.objects = {
			hello: object
		};

		bucket.get( 'hello', function( e, found ) {
			assert.deepEqual( found, object );
			done();
		} );
	} );

	it( 'should store object update', function( done ) {
		var id = 'thing',
			object = {one: 'two'};

		bucket.update( id, object, function() {
			bucket.get( id, function( err, savedObject ) {
				assert.deepEqual( object, savedObject );
				done();
			} );
		} );
	} );

	it( 'should update with options', function( done ) {
		var id = 'thing',
			object = {one: 'two'}

		bucket.update( id, object, {}, function() {
			bucket.get( id, function( err, savedObject ) {
				assert.deepEqual( object, savedObject );
				done();
			} )
		} )
	} );

	it( 'should delete object data', function( done ) {
		store.objects = {
			hello: {title: 'hola mundo'}
		};

		bucket.remove( 'hello', function() {
			assert.ok( !store.objects.hello );
			done();
		} );
	} );
} );

