import { ok, equal, deepEqual } from 'assert';

import Bucket from '../../src/simperium/bucket';
import storeProvider from './mock_bucket_store';
import { MockChannel } from './mock-channel';

describe( 'Bucket', () => {
	let bucket, store;

	beforeEach( function() {
		bucket = new Bucket( 'things', storeProvider, new MockChannel() );
		store = bucket.store;
	} );

	it( 'should fetch object data callback', function( done ) {
		var object = {title: 'hi'};
		store.objects = {
			hello: object
		};

		bucket.get( 'hello', ( e, found ) => {
			deepEqual( found, object );
			done();
		} );
	} );

	it( 'should fetch object data promise', () => {
		var object = {title: 'hi'};
		store.objects = {
			hello: object
		};

		return bucket.get( 'hello' ).then( found => {
			deepEqual( found, object );
		} );
	} );

	it( 'should store object update callback', ( done ) => {
		const id = 'thing',
			data = {one: 'two'};

		bucket.update( { id, data }, function() {
			bucket.get( id, function( err, savedObject ) {
				deepEqual( data, savedObject );
				done();
			} );
		} );
	} );

	it( 'should update with options callback', ( done ) => {
		const id = 'thing',
			data = {one: 'two'}

		bucket.update( { id, data }, function() {
			bucket.get( id, function( err, savedObject ) {
				deepEqual( data, savedObject );
				done();
			} )
		} )
	} );

	it( 'should delete object data callback', ( done ) => {
		store.objects = {
			hello: {title: 'hola mundo'}
		};

		bucket.remove( 'hello', function() {
			ok( !store.objects.hello );
			done();
		} );
	} );

	it( 'should delete object data promise', () => {
		store.objects = {
			hello: {title: 'hola mundo'}
		};

		return bucket.remove( 'hello' ).then( () => {
			ok( !store.objects.hello );
		} );
	} );

	it( 'should fetch object version callback', ( done ) => {
		store.objects = {
			thing: { other: 'thing' }
		};
		bucket.getVersion( 'thing', ( error, version ) => {
			equal( version, 0 );
			done();
		} );
	} );

	it( 'should fetch object version promise', () => {
		store.objects = {
			thing: { other: 'thing' }
		};
		bucket.getVersion( 'thing' ).then( ( version ) => {
			equal( version, 0 );
		} );
	} );
} );
