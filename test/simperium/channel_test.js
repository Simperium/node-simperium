/*eslint no-shadow: 0*/
import Channel from '../../src/simperium/channel'
import util from 'util'
import { parseMessage } from '../../src/simperium/util'
import { equal, ok, deepEqual, fail } from 'assert'
import * as fn from './fn'
import jsondiff from '../../src/simperium/jsondiff'
import defaultGhostStoreProvider from '../../src/simperium/ghost/default'
import { v4 as uuid } from 'uuid'
import Bucket from '../../src/simperium/bucket'
import mockBucketStore from './mock_bucket_store'

const differ = jsondiff
const diff = differ.object_diff.bind( differ )
const cycle = ( ... fns ) => ( ... args ) => {
	const [ head, ... rest ] = fns
	head( ... args )
	fns = rest.concat( head )
}

describe( 'Channel', function() {
	var channel, bucket, store;

	beforeEach( function() {
		store = defaultGhostStoreProvider( bucket );
		channel = new Channel( 'mock-app-id', 'mock-token', store, 'things' );
		bucket = new Bucket( 'things', mockBucketStore, channel );
	} );

	it( 'should send init on connect', function( done ) {
		channel.on( 'send', function( data ) {
			var message = parseMessage( data ),
				payload = JSON.parse( message.data );

			ok( payload.name );
			equal( 'init', message.command );
			equal( 'mock-token', payload.token );
			equal( payload.api, '1.1' );
			equal( 'mock-app-id', payload.app_id );
			equal( 'node-simperium', payload.library );
			equal( payload.version, '0.0.1' );
			done();
		} );

		channel.onConnect();
	} );

	it( 'should apply change', function( done ) {
		var id = 'thingamajig',
			version = 1,
			data		= { content: 'Lol' },
			changes = [{ sv: version,
				o: 'M',
				id: id,
				clientid: 'sjs-2013070502-a1fab97d463883d66bae',
				v: diff( data, {content: 'hola mundo'} ),
				ev: 106,
				cv: '5262d90aba5fdc4ed7eb2bc7',
				ccids: [ 'ebd2c21c8a91be24c078746d9e935a3a' ]
			}];

		channel.once( 'update', function( id, data ) {
			equal( data.content, 'Lol' );

			channel.once( 'update', function( id, data ) {
				equal( data.content, 'hola mundo' );
				done();
			} );
			channel.handleMessage( util.format( 'c:%s', JSON.stringify( changes ) ) );
		} );

		channel.handleMessage( util.format( 'i:%s', JSON.stringify( {index: [{v: version, id: id, d: data}]} ) ) );
	} );

	it( 'should queue multiple changes', function( done ) {
		var id = 'object',
			version1 = { content: 'step 1'},
			version2 = { content: 'step 2'},
			version3 = { content: 'step 3'},
			change1 = { o: 'M', ev: 1, cv: 'cv1', id: id, v: diff( {}, version1 )},
			change2 = { o: 'M', ev: 2, sv: 1, cv: 'cv2', id: id, v: diff( version1, version2 )},
			change3 = { o: 'M', ev: 3, sv: 2, cv: 'cv3', id: id, v: diff( version2, version3 )},
			check = fn.counts( 2, function( id, data ) {
				equal( data.content, 'step 3' );
				done();
			} );

		channel.on( 'update', check );

		channel.onChanges( JSON.stringify( [change1, change2, change3] ) );
	} );

	describe( 'with index', function() {
		beforeEach( function() {
			channel.localQueue.start();
		} );

		it( 'should send change to create object', function( done ) {
			channel.on( 'send', function( data ) {
				var marker = data.indexOf( ':' ),
					command = data.substring( 0, marker ),
					payload = JSON.parse( data.substring( marker + 1 ) ),
					patch = payload.v;

				equal( command, 'c' );
				equal( patch.content.o, '+' );
				equal( patch.content.v, 'Hola mundo!' );
				done();
			} );

			bucket.update( '12345', {content: 'Hola mundo!'} );
		} );

		it( 'should not send a change with an empty diff', function( done ) {
			var data = { title: 'hello world'};
			channel.store.put( 'thing', 1, {title: 'hello world'} )
				.then( function() {
					channel.localQueue.on( 'send', function() {
						fail( 'Channel should not send empty changes' );
					} );
					channel.once( 'unmodified', function() {
						done();
					} );
					bucket.update( 'thing', data );
				} );
		} );

		it( 'should queue a change when pending exists', function( done ) {
			var data = { title: 'Hola mundo!', content: 'Bienvenidos a Simperium' },
				data2 = { title: 'Hell world!', content: 'Welcome to Simperium' },
				checkSent = function() {
					throw new Error( 'Sent too many changes' );
				},
				objectId = '123456';

			channel.on( 'send', fn.counts( 1, checkSent ) );

			channel.on( 'send', function() {
				bucket.update( objectId, data2 );
			} )

			channel.localQueue.on( 'wait', function( id ) {
				equal( id, objectId );
				done();
			} );

			objectId = '123456';
			bucket.update( objectId, data );
		} );

		it( 'should acknowledge sent change', function( done ) {
			var data = { title: 'Auto acknowledge!' };

			channel.on( 'acknowledge', function( id ) {
				equal( undefined, channel.localQueue.sent[id] );
				done();
			} );

			channel.on( 'send', function( msg ) {
				acknowledge( channel, msg );
			} );

			bucket.update( 'mock-id', data );
		} );

		it( 'should ignore duplicate change error if nothing to acknowledge', ( done ) => {
			let id = 'mock-id', ccid = 'mock-ccid'
			// queue should emit a finish event when the change is processed
			channel.networkQueue.queueFor( id ).on( 'finish', () => done() )
			channel.handleMessage( 'c:' + JSON.stringify( [ { ccids: [ ccid ], error: 409, id }] ) )
		} )

		it( 'should resend sent but unacknowledged changes on reconnect', () => new Promise( resolve => {
			channel.localQueue.sent['fake-ccid'] = { fake: 'change', ccid: 'fake-ccid' }

			channel.on( 'send', cycle(
				m => setImmediate( () => {
					equal( m, 'i:1:::10' )
					channel.handleMessage( 'i:{"index":[],"current":"cv"}' )
				} ),
				m => setImmediate( () => {
					equal( m, 'c:{"fake":"change","ccid":"fake-ccid"}' )
					resolve()
				} )
			) )

			channel.handleMessage( 'auth:user@example.com' )
		} ) )

		it( 'should send remove operation', function( done ) {
			channel.on( 'send', function( msg ) {
				var message = parseMessage( msg ),
					change = JSON.parse( message.data );

				equal( change.o, '-' );
				equal( change.id, '123' );

				// acknowledge the change
				acknowledge( channel, msg );
			} );

			channel.on( 'acknowledge', function() {
				store.get( '123' ).then( function( ghost ) {
					ok( !ghost.version, 'store should have deleted ghost' );
					deepEqual( ghost.data, {} );
					done();
				} );
			} );

			store.put( '123', 3, {title: 'hello world'} ).then( function() {
				store.get( '123' ).then( function( ghost ) {
					equal( ghost.version, 3 );
					bucket.remove( '123' );
				} );
			} );
		} );

		it( 'should wait for changes before removing', function( done ) {
			var validate = fn.counts( 1, function() {
				var queue = channel.localQueue.queues['123'];
				equal( queue.length, 2 );
				equal( queue.slice( -1 )[0].o, '-' );
				done();
			} );

			channel.localQueue.on( 'wait', validate );

			channel.once( 'send', function() {
				bucket.update( '123', {title: 'hello again world'} );
				bucket.remove( '123' );
			} );

			store.put( '123', 3, {title: 'hello world'} ).then( function() {
				bucket.update( '123', {title: 'goodbye world'} );
			} );
		} );

		it( 'should notify bucket after receiving a network change', () => {
			const id = 'object',
				data = { content: 'step 1'},
				change = { o: 'M', ev: 1, cv: 'cv1', id: id, v: diff( {}, data )};

			return new Promise( ( resolve ) => {
				bucket.on( 'update', () => {
					bucket.get( 'object' ).then( ( object ) => {
						equal( object.data.content, 'step 1' );
						resolve();
					} );
				} );
				channel.handleMessage( 'c:' + JSON.stringify( [change] ) );
			} );
		} );

		it( 'should emit ready after receiving changes', ( done ) => {
			channel.on( 'ready', () => done() )
			channel.handleMessage( 'c:[]' );
		} )

		it( 'should notify bucket after network deletion', () => new Promise( ( resolve, reject ) => {
			var key = 'deleteTest';

			bucket.on( 'remove', function( id ) {
				bucket.get( id ).then( object => {
					equal( object, undefined );
					resolve();
				}, reject );
			} );

			bucket.update( key, {title: 'hello world'}, function() {
				channel.handleMessage( 'c:' + JSON.stringify( [{
					o: '-', ev: 1, cv: 'cv1', id: key
				}] ) );
			} );
		} ) );

		it( 'should request revisions', function( done ) {
			var key = 'thing',
				version = 8,
				assertMessage = function( msg ) {
					var msg = parseMessage( msg ),
						versionMsg = msg.data.split( '.' );

					equal( 'e', msg.command );
					equal( key, versionMsg[0] );
				},
				requests = [];

			store.index[key] = JSON.stringify( {version: version, data: {title: 'Hello world'}} );

			channel.on( 'send', function( message ) {
				var i;
				var msg;
				var body;

				requests.push( message );
				assertMessage( message );
				if ( requests.length === 8 ) {
					for ( i = 0; i < 8; i++ ) {
						msg = 'e:' + key + '.' + ( i + 1 );
						body = JSON.stringify( {title: 'title: ' + ( i + 1 )} );

						channel.handleMessage( msg + '\n' + body );
					}
				}
			} );

			bucket.getRevisions( key, function( err, revisions ) {
				if ( err ) return done( err );
				equal( 8, revisions.length );
				done();
			} );
		} );

		it( 'should have local changes on send', function( done ) {
			channel.once( 'send', function() {
				bucket.hasLocalChanges( ( error, hasChanges ) => {
					equal( hasChanges, true );
					done();
				} );
			} );

			store.put( '123', 3, {title: 'hello world'} ).then( function() {
				bucket.update( '123', {title: 'goodbye world!!'} );
			} );
		} );

		// If receiving a remote change while there are unsent local modifications,
		// local changes should be rebased onto the new ghost and re-sent
		it( 'should resolve applying patch to modified object', () => new Promise( ( resolve, reject ) => {
			// add an item to the index
			const key = 'hello',
				current = { title: 'Hello world' },
				remoteDiff = diff( current, { title: 'Hello kansas'} );

			store.index[key] = JSON.stringify( { version: 1, data: current } );

			// the first send is the attempt to change Hello world to Goodbye world
			channel.once( 'send', ( data ) => {
				// a network change has been received, now we're going to send
				// the rebased diff
				channel.once( 'send', () => {
					bucket.get( key ).then( ( bucketObject ) => {
						try {
							// bucket object is the result of rebasing local modifications
							// on top of the network changes
							deepEqual( bucketObject.data, { title: 'Goodbye kansas' } );
							// the channel will send the diff that results from the rebased
							// object and the latest ghost
							deepEqual(
								channel.localQueue.sent[key].v,
								diff( { title: 'Hello kansas' }, { title: 'Goodbye kansas' } )
							);
						} catch ( error ) {
							reject( error );
						}
						resolve();
					} )
				} )
				// We receive a remote change from "Hello world" to "Hello kansas"
				channel.handleMessage( 'c:' + JSON.stringify( [{
					o: 'M', ev: 2, sv: 1, cv: 'cv1', id: key, v: remoteDiff
				}] ) );
			} );

			// We're changing "Hello world" to "Goodbye world"
			bucket.update( key, {title: 'Goodbye world'} );

		} ) );

		/**
		 * This test simulates a case where an application updates an object locally but quits
		 * before it can send the change to simperium. This could happen when an object is modified
		 * while the application does not have a network connection.
		 *
		 * If the same object is modified elsewhere, the application will receive a network change
		 * and update it's ghost for the object. However, becaus the Channel's localQueue of changes
		 * is in-memory only, the library will not merge the changes from when the bucket object
		 * was updated while offline.
		 *
		 * In this state, if the application updates that object, it will overwrite the the network
		 * changes completely because it will use the updated ghost as its new base for diffing.
		 */
		it( 'should merge network changes to a locally modified object', () => new Promise( ( resolve, reject ) => {
			// add an item to the index
			const key = 'hello',
				current = { title: 'Hello world' },
				remoteDiff = diff( current, { title: 'Hello kansas'} );

			store.index[key] = JSON.stringify( { version: 1, data: current } );

			// when the channel is updated, it should be the result of
			// the local changes being rebased on top of changes coming from the
			// network which should ultimately be "Goodbye kansas"
			channel.on( 'update', function( key, data ) {
				try {
					equal( data.title, 'Goodbye kansas' );
				} catch ( error ) {
					reject( error );
				}
				resolve();
			} );

			channel.once( 'send', function() {
				// delete the contents of the localQueue to simulate the application
				// quiting and returning with an empty queue
				channel.localQueue.queues = {}
				// delete the sent changes that the queue is waiting for
				channel.localQueue.sent = {};

				// We receive a remote change from "Hello world" to "Hello kansas"
				channel.handleMessage( 'c:' + JSON.stringify( [{
					o: 'M', ev: 2, sv: 1, cv: 'cv1', id: key, v: remoteDiff
				} ] ) );
			} );

			// We're changing "Hello world" to "Goodbye world"
			bucket.update( key, {title: 'Goodbye world'} );
		} ) );

		it( 'should emit errors on the bucket instance', ( done ) => {
			const error = {error: 404, id: 'thing', ccids: ['abc']}
			bucket.on( 'error', ( e ) => {
				equal( 404, e.code )
				equal( `${ e.code } - Could not apply change to: ${error.id}`, e.message )
				done()
			} )
			channel.handleMessage( 'c:' + JSON.stringify( [ error ] ) );
		} );

		it( 'should ignore 412 change errors', function( done ) {
			// if a change is sent and acknowledged with a 412, change should be dequeued and
			// no error should be emitted
			var change = {o: 'M', id: 'thing', ev: 2, ccid: 'abc', v: diff( {}, {hello: 'world'} ) };

			// channel should not emit error during this change
			channel.on( 'error', function( e ) {
				done( e );
			} );

			// add fake ghost
			channel.store.put( 'thing', 1, {} ).then( function() {
				// change is acknowledged and cleared from the queue
				channel.on( 'acknowledge', function() {
					ok( !channel.localQueue.sent.thing );
					done();
				} );

				// listen for change to be sent
				channel.localQueue.once( 'send', function() {
					ok( channel.localQueue.sent.thing );
					// send a 412 response
					channel.handleMessage( 'c:' + JSON.stringify( [{error: 412, id: 'thing', ccids: ['abc']}] ) );
				} );
				// queue up the change
				channel.localQueue.queue( change );
			} );
		} );

		it( 'should send full object on 405 error', function( done ) {
			// if a change is sent and a 405 is returned, the full object should be sent
			// Add an object to the store
			channel.store.put( 'thing', 1, {} );

			// channel should not emit error during this change
			channel.on( 'error', function( e ) {
				done( e );
			} );

			// ensure that a change with a `d` property is added to the queue
			channel.localQueue.once( 'queued', function( id, change, queue ) {
				ok( queue[0].d );
				done();
			} );

			// send a 405 error
			channel.handleMessage( 'c:' + JSON.stringify( [{error: 405, id: 'thing', ccids: ['abc']}] ) );
		} );

		describe( 'with synced object', () => {
			beforeEach( ( done ) => {
				var data = { title: 'hola mundo' };

				channel.on( 'acknowledge', function() {
					done();
				} );

				channel.on( 'send', function( msg ) {
					acknowledge( channel, msg );
				} );

				bucket.update( 'mock-id', data );
			} );

			it( 'should get version', ( done ) => {
				bucket.getVersion( 'mock-id', ( error, version ) => {
					equal( version, 1 );
					done()
				} );
			} );
		} );
	} );

	it( 'should request index when cv is unknown', done => {
		channel.once( 'send', ( data ) => {
			ok( !store.cv );
			ok( bucket.isIndexing );
			equal( data, 'i:1:::10' );
			done();
		} );
		channel.handleMessage( 'cv:?' );
	} );

	// TODO: handle auth failures
	// <=	 0:auth:expired
	// =>	 0:i:1:::10
	// <=	 0:auth:{"msg": "Error validating token", "code": 500}
	// =>	 0:i:1:::10
	it( 'should report failed auth', function( done ) {
		channel.on( 'unauthorized', function() {
			done();
		} );

		channel.onConnect();
		channel.handleMessage( 'auth:{"msg": "Error validating token", "code": 500}' );
	} );

	describe( 'after authorizing', function() {
		beforeEach( () => new Promise( resolve => {
			channel.once( 'send', () => resolve() );
			channel.onConnect();
		} ) );

		it( 'should request index', function( done ) {
			channel.once( 'send', function( data ) {
				var message = parseMessage( data );

				equal( 'i', message.command );
				equal( '1:::10', message.data );
				done();
			} );

			channel.handleMessage( 'auth:user@example.com' );
		} );

		it( 'should request cv', function( done ) {
			var cv = 'abcdefg';

			channel.once( 'send', function( data ) {
				setImmediate( function() {
					var message = parseMessage( data );
					equal( 'cv', message.command );
					equal( cv, message.data );
					done();
				} )
			} );

			store.setChangeVersion( cv ).then( function() {
				channel.handleMessage( 'auth:user@example.com' );
			} );
		} );

		it( 'should emit index and ready event when index complete', () => new Promise( resolve => {
			var page = 'i:{"index":[{"id":"objectid","v":1,"d":{"title":"Hello World"}}],"current":"cv"}';
			let indexed = false

			channel.on( 'index', function( cv ) {
				equal( 'cv', cv );
				ok( !bucket.isIndexing );
				indexed = true
			} );

			channel.on( 'ready', () => {
				ok( indexed )
				resolve()
			} )

			channel.startIndexing();
			channel.handleMessage( page );
		} ) );

		it( 'should request next index page', function( done ) {
			var page = 'i:{"index":[{"id":"objectid","v":1,"d":{"title":"Hello World"}}],"mark":"next-mark","current":"cv"}';
			channel.once( 'send', function() {
				channel.handleMessage( page );
			} );
			bucket.once( 'indexing', function() {
				ok( bucket.isIndexing );
				done();
			} );
			channel.handleMessage( 'auth:user@example.com' );
		} );

		it( 'should request entire object when source version is out of date', ( done ) => {
			var change = {o: 'M', id: 'thing', sv: 1, ev: 2, ccid: 'abc', cv: 'new-cv', v: diff( { hello: 'mundo'}, {hello: 'world'} ) };
			channel.once( 'send', ( data ) => {
				equal( data, `e:${change.id}.${change.sv}` );
				channel.once( 'change-version', ( cv ) => {
					equal( cv, 'new-cv' );
					done();
				} );
				channel.handleMessage( `e:${change.id}.${change.sv}\n${JSON.stringify( { data: { hello: 'mundo'} } )} ` );
			} );
			channel.handleMessage( `c:[${JSON.stringify( change )}]` );
		} );
	} );
} );

function acknowledge( channel, msg, cv ) {
	var message = parseMessage( msg ),
		change = JSON.parse( message.data ),
		ack = {
			id: change.id,
			o: change.o,
			v: change.v,
			ev: change.sv ? change.sv + 1 : 1,
			ccids: [change.ccid],
			cv: cv || uuid.v4()
		};

	if ( change.sv ) {
		ack.sv = change.sv;
	}

	channel.handleMessage( util.format( 'c:%s', JSON.stringify( [ack] ) ) );
}
