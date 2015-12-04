import Channel from 'simperium/server/channel'
import * as client from 'simperium'
import defaultGhostStoreProvider from 'simperium/ghost/default'
import assert from 'assert'
import mockBucketStore from '../mock_bucket_store'
import * as fn from '../fn'
import MockBucket from './mock-bucket'
import * as change from 'simperium/util/change'

const successAuthorizer = ( email, bucket ) => {
	return ( token, cb ) => {
		cb( null, email, bucket );
	}
}

describe( 'Server Channel', function() {
	var channel;

	beforeEach( function() {
		channel = new Channel();
	} )

	it( 'should authorize a bucket', function( done ) {
		var authorized = false;
		channel.authorizer = successAuthorizer( 'user@example.com', mockBucket() )

		channel.on( 'authorized', ( user ) => {
			authorized = true;
			assert.equal( user, 'user@example.com' )
		} )

		channel.on( 'send', function( msg ) {
			assert.equal( 'auth:' + 'user@example.com', msg )
			assert( authorized )
			done();
		} )

		channel.receiveMessage( initMessage() );
	} )

	describe( 'after authorized', function() {
		var connection, authorize, log, bucket;

		beforeEach( () => {
			log = false;
			connection = buildClientChannel();
			bucket = mockBucket()
			channel.authorizer = successAuthorizer( 'user@example.com', bucket )

			channel.on( 'send', ( msg ) => {
				if ( log ) console.log( 'client', '<=', msg );
				connection.handleMessage( msg );
			} )

			connection.on( 'send', ( msg ) => {
				if ( log ) console.log( 'server', '<=', msg );
				channel.receiveMessage( msg )
			} )
		} )

		authorize = ( cb ) => {
			if ( cb ) channel.once( 'authorized', cb )
			connection.onConnect();
		}

		it( 'should respond to index request with empty index', ( done ) => {
			connection.bucket.on( 'index', () => {
				done()
			} )
			authorize()
		} )

		it( 'should respond to index request with multipage index', ( done ) => {
			channel.authorizer = successAuthorizer( 'user@example.com', mockBucket( '100s', mockIndexData( 100 ) ) )
			connection.bucket.on( 'index', () => {
				done()
			} )
			authorize()
		} )

		it( 'should respond to unknown cv request with ?', ( done ) => {
			// populate the client's bucket with a cv
			connection.store.cv = 'notearealcv'
			channel.on( 'authorized', () => {
				channel.on( 'send', fn.counts( 1, ( msg ) => {
					assert.equal( msg, 'cv:?' )
					done()
				} ) )
			} )
			authorize()
		} )

		it( 'should respond to known cv request with no changes', ( done ) => {
			connection.store.cv = 'actualcv'
			channel.authorizer = successAuthorizer( 'user@example.com', mockBucket( 'currentcv', [], [{ cv: 'actualcv' }] ) )

			channel.on( 'authorized', () => {
				channel.on( 'send', fn.counts( 1, ( msg ) => {
					setImmediate( () => {
						assert.equal( 'c:[]', msg )
						done()
					} )
				} ) )
			} )
			authorize()
		} )

		it( 'should respond to known cv with changes', ( done ) => {
			const changes = [
				{ cv: 'newest', clientid: 'other-client', ev: 1, id: 'object2', o: 'M', v: change.diff( {}, {title: 'Hello world'} ), ccids: ['id2'] },
				{ cv: 'newestminus1', clientid: 'other-client', ev: 1, id: 'object1', o: 'M', v: change.diff( {}, {title: 'Hola Mundo'} ), ccids: ['id1'] }
			]
			connection.store.cv = 'actualcv'
			channel.authorizer = successAuthorizer( 'user@example.com', mockBucket( 'currentcv', [], changes.concat( { cv: 'actualcv' } ) ) )

			channel.on( 'authorized', () => {
				channel.on( 'send', fn.counts( 1, ( msg ) => {
					setImmediate( () => {
						assert.equal( msg, 'c:' + JSON.stringify( changes.reverse() ) )
						done()
					} )
				} ) )
			} )
			authorize()
		} )

		it( 'should receive a change from a connection', ( done ) => {
			const incomingChange = change.buildChange( 'M', 'thing', { title: 'Hello world' }, { data: {} } )
			bucket = mockBucket()
			channel.authorizer = successAuthorizer( 'user@example.com', bucket )

			bucket.applyChange = ( chg, cb ) => {
				setImmediate( () => {
					assert.equal( typeof( cb ), 'function' )
					done()
				} )
			}

			authorize()
			channel.receiveMessage( 'c:' + JSON.stringify( incomingChange ) );
		} )

		it( 'should send change to connection when notified', ( done ) => {
			const incomingChange = Object.assign( { ccids: ['id'] }, change.buildChange( 'M', 'thing', { title: 'Hello world' }, { data: {} } ) )
			connection.bucket.on( 'index', () => {
				channel.on( 'send', ( msg ) => {
					setImmediate( () => {
						assert.equal( msg, 'c:' + JSON.stringify( [ incomingChange ] ) )
						done()
					} )
				} )
				bucket.emit( 'change', incomingChange )
			} )
			authorize()
		} )
	} )
} )

function initMessage( name ) {
	return 'init:' + JSON.stringify( {
		name: name || 'things',
		clientid: 'session-x',
		api: '1.1',
		token: 'valid-token',
		app_id: 'application-id',
		library: 'node-simperium',
		version: '0.0.1'
	} )
}

function buildClientChannel() {
	var bucket = new client.Bucket( 'things', mockBucketStore );
	return new client.Channel( 'app', 'token', bucket, defaultGhostStoreProvider( bucket ) );
}

function mockBucket( cv, index, history ) {
	return new MockBucket( cv || 'cv', index || [], history || [] );
}

function mockIndexData( count ) {
	var index = [], i;
	for ( i = 0; i < count; i++ ) {
		index.push( { id: 'object-' + i, v: i, d: { title: 'Hello world' } } )
	}
	return index;
}
