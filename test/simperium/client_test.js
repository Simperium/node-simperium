import { Client } from '../../src/simperium/client';
import * as events from 'events';
import { equal, deepEqual, ok } from 'assert';

class MockWebSocket extends events.EventEmitter {
	constructor( ...args ) {
		super( ...args );
		this.outbox = [];
	}

	close() {
		// noop
	}

	send( msg ) {
		this.emit( 'send', msg );
		this.outbox.push( msg );
	}
}

describe( 'Client', () => {
	let socket, client;

	const websocketClientProvider = ( url ) => {
		socket = new MockWebSocket( url );
		return socket;
	}

	beforeEach( () => {
		client = new Client( 'MOCK_ID', 'MOCK_TOKEN', {
			websocketClientProvider
		} );
	} )

	afterEach( () => {
		client.end();
	} );

	it( 'connects', ( done ) => {
		client.once( 'connect', () => {
			client.end();
			done();
		} );

		socket.onopen()
	} );

	it( 'emits unauthorized when unauthorized', ( done ) => {
		client.once( 'unauthorized', () => done() );

		client.onUnauthorized();
	} );

	it( 'ticks heartbeat on message', () => {
		client.onMessage( { data: 'h:5' } );
		equal( 5, client.heartbeat.count );
	} );

	it( 'emits error when fails to send message', ( done ) => {
		const expected = new Error( 'nope' );
		socket.send = () => {
			throw expected;
		}

		client.once( 'error', ( error ) => {
			equal( expected, error );
			done();
		} )

		client.send();
	} )

	it( 'sends heartbeat', () => {
		socket.once( 'send', ( msg ) => {
			equal( 'h:5', msg )
		} );

		client.sendHeartbeat( 5 );
	} )

	it( 'setAccessToken emits access-token and connects', ( done ) => {
		client.once( 'access-token', ( token ) => {
			client.once( 'connect', () => {
				done();
			} )

			equal( 'mock-token', token );
			socket.onopen();
		} );

		client.setAccessToken( 'mock-token' );
	} );

	it( 'parses channel specific message', ( done ) => {
		client.once( 'channel:500', ( msg ) => {
			equal( 'c:blah', msg );
			done();
		} );
		client.parseMessage( { data: '500:c:blah' } );
	} );

	it( 'creates bucket and sends init message', ( done ) => {
		client.on( 'error', done );

		client.bucket( 'ships' );

		socket.once( 'send', ( msg ) => {
			const preamble = '0:init:';

			equal( msg.slice( 0, preamble.length ), '0:init:' );

			const payload = JSON.parse( msg.slice( preamble.length ) );

			equal( '1.1', payload.api );
			equal( '0.0.1', payload.version );
			equal( 'MOCK_ID', payload.app_id );
			equal( 'MOCK_TOKEN', payload.token );
			equal( 'node-simperium', payload.library );
			equal( 'ships', payload.name );
			ok(
				( /^node-[-a-z0-9]{1,}$/ ).test( payload.clientid ),
				`Invalid clientid ${ payload.clientid }`
			);

			done();
		} );

		// We expect the client to attempt to authorize a bucket
		// once the socket connects
		socket.onopen();
	} );
} );

