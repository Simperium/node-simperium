import Channel from 'simperium/server/channel'
import * as client from 'simperium'
import defaultGhostStoreProvider from 'simperium/ghost/default'
import assert from 'assert'
import mockBucketStore from '../mock_bucket_store'
import EventEmitter from 'events'
import { inherits } from 'util'
import * as fn from '../fn'

const successAuthorizer = ( email, bucket ) => {
	return ( token, fn ) => {
		fn( null, email, bucket );
	}
}

describe( 'Server', function() {
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
		var connection, authorize, log;

		beforeEach( () => {
			log = false;
			connection = buildClientChannel();
			channel.authorizer = successAuthorizer( 'user@example.com', mockBucket() )

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
			log = true
			// populate the client's bucket with a cv
			connection.store.cv = 'notearealcv'
			channel.on( 'authorized', () => {
				channel.on( 'send', fn.counts(1, ( msg ) => {
					assert.equal( msg, 'cv:?' )
					done()
				} ) )
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

function mockBucket( cv, index ) {
	return new MockBucket( cv || 'cv', index || [] );
}

function mockIndexData( count ) {
	var index = [], i;
	for ( i = 0; i < count; i++ ) {
		index.push( { id: 'object-' + i, v: i, d: { title: 'Hello world' } } )
	}
	return index;
}

function MockBucket( cv, index ) {
	this.cv = cv;
	this.index = index;
	EventEmitter.call( this );
}

inherits( MockBucket, EventEmitter );

MockBucket.prototype.queryIndex = function( mark, count, fn ) {
	var nextMark = null;

	count = parseInt( count );

	if ( isNaN( count ) ) {
		count = this.index.length
	}

	mark = parseInt( mark );

	if ( isNaN( mark ) ) {
		mark = 0;
	}

	if ( mark + count < this.index.length ) {
		nextMark = mark + count;
	}

	fn( this.cv, nextMark, this.index.slice( mark, mark + count ) );
}
