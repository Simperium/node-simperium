import Bucket from '../../src/simperium/bucket';
import Channel from '../../src/simperium/channel';
import defaultGhostStoreProvider from '../../src/simperium/ghost/default'
import mockBucketStore from './mock_bucket_store';
import { deepEqual, equal } from 'assert';
import parseMessage from '../../src/simperium/util/parse_message';

describe( 'Crossed Wires', () => {
	it( 'handles when server modifies the change', async() => {
		/**
		 * Scenario:
		 *
		 * Client 1 sends a change (ccid x) "AC" => "ACD" : "=2\t+D"
		 * Client 2 sends a change (ccid y) "AC" => "ABC" : "=1\t+B\t=1"
		 *
		 * Server accepts ccid x as is and broadcasts back to clients
		 *
		 *   c:{ccids:[y],v:"=1\t+B\t=1"}
		 *
		 * Server accepts ccid y, server sees that the change needs to be modified because of x:
		 *
		 *   c:{ccids:[x],v:"=3\t+D"}
		 *
		 * Client 1 and Client 2 should now have Ghosts that match.
		 */

		// Two clients that need indexes downloaded
		const bucketX = createBucket();
		bucketX.id = 'x';
		const bucketY = createBucket();
		bucketY.id = 'y';
		const clients = [bucketX, bucketY];

		const responses = await Promise.all( [
			waitForClient( bucketX, () => bucketX.channel.handleMessage( 'auth:user' ) ),
			waitForClient( bucketY, () => bucketY.channel.handleMessage( 'auth:user' ) ),
		] );

		deepEqual(
			Array( 2 ).fill( 'i:1:::10' ),
			responses
		);

		const cvs = await Promise.all( clients.map( client => {
			const indexed = new Promise( resolve => {
				client.once( 'index', resolve );
			} );
			client.channel.handleMessage( 'i:' + JSON.stringify( {
				index: [{
					id: 'note-id',
					v: 1,
					d: { content: 'AC' }
				}],
				current: 'cv-1',
			} ) );
			return indexed;
		} ) );

		deepEqual( Array( 2 ).fill( 'cv-1' ), cvs );

		deepEqual(
			Array( 2 ).fill( { data: { content: 'AC' }, id: 'note-id' } ),
			await Promise.all( clients.map( client => client.get( 'note-id' ) ) ),
		);

		const [changeY, changeX] = ( await Promise.all( [
			waitForClient( bucketY, () => bucketY.update( 'note-id', { content: 'ABC' } ) ),
			waitForClient( bucketX, () => bucketX.update( 'note-id', { content: 'ACD' } ) ),
		] ) ).map( msg => JSON.parse( parseMessage( msg ).data ) );

		equal( '=1\t+B\t=1', changeY.v.content.v );
		equal( '=2\t+D', changeX.v.content.v );

		/**
		 * At this point, both clients have sent a change and are waiting for the
		 * server to respond. Their `localQueue`s should have a `.sent['note-id']`.
		 *
		 * If a client were to update `note-id` at this moment, since it is waiting
		 * for the sent change to be acknowledged by the server it will indicate
		 * that with a `localQueue.queues['note-id']`.
		 */
		const [serverChange1] = [
			[ { cv: 'cv-2', ccids: [changeY.ccid], sv: 1, ev: 2, id: 'note-id', o: 'M', v: { content: {
				o: 'd', v: '=1\t+B\t=1'
			} } } ],
			// This ccid/change is modified by the server, see: '=3\t+D' vs '=2\t+D'
			[ { cv: 'cv-3', ccids: [changeX.ccid], sv: 1, ev: 2, id: 'note-id', o: 'M', v: { content: {
				o: 'd', v: '=3\t+D'
			} } } ],
		];

		const notes = await Promise.all( [
			new Promise( resolve => {
				bucketY.channel.once( 'acknowledge', () => resolve( bucketY.get( 'note-id' ) ) );
				bucketY.channel.handleMessage( 'c:' + JSON.stringify( serverChange1 ) );
			} ),
			new Promise( resolve => {
				bucketX.once( 'update', () => resolve( bucketX.get( 'note-id' ) ) );
				bucketX.channel.handleMessage( 'c:' + JSON.stringify( serverChange1 ) );
			} )
		] );

		deepEqual(
			[ 'ABC', 'ABCD' ],
			notes.map( note => note.data.content ),
		)
	} )

	it( 'ignores ccid after receiving a 409 for it', async() => {
		/**
		 * Scenario:
		 *
		 * Client 1 sends a change (ccid x) "AC" => "ACD" : "=2\t+D"
		 * Client 2 sends a change (ccid y) "AC" => "ABC" : "=1\t+B\t=1"
		 *
		 * Server accepts ccid x as is and broadcasts back to clients
		 *
		 *   c:{ccids:[y],v:"=1\t+B\t=1"}
		 *
		 * Server accepts ccid y, server sees that the change needs to be modified because of x:
		 *
		 *   c:{ccids:[x],v:"=3\t+D"}
		 *
		 * Client 1 and Client 2 should now have Ghosts that match.
		 */

		// Two clients that need indexes downloaded
		const bucketX = createBucket();
		bucketX.id = 'x';
		const bucketY = createBucket();
		bucketY.id = 'y';
		const clients = [bucketX, bucketY];

		const responses = await Promise.all( [
			waitForClient( bucketX, () => bucketX.channel.handleMessage( 'auth:user' ) ),
			waitForClient( bucketY, () => bucketY.channel.handleMessage( 'auth:user' ) ),
		] );

		deepEqual(
			Array( 2 ).fill( 'i:1:::10' ),
			responses
		);

		const cvs = await Promise.all( clients.map( client => {
			const indexed = new Promise( resolve => {
				client.once( 'index', resolve );
			} );
			client.channel.handleMessage( 'i:' + JSON.stringify( {
				index: [{
					id: 'note-id',
					v: 1,
					d: { content: 'AC' }
				}],
				current: 'cv-1',
			} ) );
			return indexed;
		} ) );

		deepEqual( Array( 2 ).fill( 'cv-1' ), cvs );

		deepEqual(
			Array( 2 ).fill( { data: { content: 'AC' }, id: 'note-id' } ),
			await Promise.all( clients.map( client => client.get( 'note-id' ) ) ),
		);

		const [changeY, changeX] = ( await Promise.all( [
			waitForClient( bucketY, () => bucketY.update( 'note-id', { content: 'ABC' } ) ),
			waitForClient( bucketX, () => bucketX.update( 'note-id', { content: 'ACD' } ) ),
		] ) ).map( msg => JSON.parse( parseMessage( msg ).data ) );

		equal( '=1\t+B\t=1', changeY.v.content.v );
		equal( '=2\t+D', changeX.v.content.v );

		/**
		 * At this point, both clients have sent a change and are waiting for the
		 * server to respond. Their `localQueue`s should have a `.sent['note-id']`.
		 *
		 * If a client were to update `note-id` at this moment, since it is waiting
		 * for the sent change to be acknowledged by the server it will indicate
		 * that with a `localQueue.queues['note-id']`.
		 */
		const [serverChange1] = [
			[ { cv: 'cv-2', ccids: [changeY.ccid], sv: 1, ev: 2, id: 'note-id', o: 'M', v: { content: {
				o: 'd', v: '=1\t+B\t=1'
			} } } ],
			// This ccid/change is modified by the server, see: '=3\t+D' vs '=2\t+D'
			[ { cv: 'cv-3', ccids: [changeX.ccid], sv: 1, ev: 2, id: 'note-id', o: 'M', v: { content: {
				o: 'd', v: '=3\t+D'
			} } } ],
		];

		const notes = await Promise.all( [
			new Promise( ( resolve, reject ) => {
				bucketY.channel.on( 'acknowledge', () => {
					setTimeout(() => resolve(bucketY.get('note-id')), 10);
				} );

				bucketY.channel.on( 'send', (data) => {
					reject(new Error( 'should not send more things' ) );
				} );

				bucketY.channel.handleMessage( 'c:' + JSON.stringify([{
					id: 'note-id',
					error: 409,
					ccids: serverChange1[0].ccids,
				}] ) );

				bucketY.channel.handleMessage( 'c:' + JSON.stringify( serverChange1 ) );
			} ),
			new Promise( resolve => {
				bucketX.once( 'update', () => resolve( bucketX.get( 'note-id' ) ) );
				bucketX.channel.handleMessage( 'c:' + JSON.stringify( serverChange1 ) );
			} )
		] );

		deepEqual(
			[ 'ABC', 'ABCD' ],
			notes.map( note => note.data.content ),
		)
	} )

	it( 'ignores inbound changes after they have already been applied', async() => {
		/**
		 * Scenario:
		 *
		 * Client 1 sends a change (ccid x) "AC" => "ACD" : "=2\t+D"
		 * Client 2 sends a change (ccid y) "AC" => "ABC" : "=1\t+B\t=1"
		 *
		 * Server accepts ccid x as is and broadcasts back to clients
		 *
		 *   c:{ccids:[y],v:"=1\t+B\t=1"}
		 *
		 * Server accepts ccid y, server sees that the change needs to be modified because of x:
		 *
		 *   c:{ccids:[x],v:"=3\t+D"}
		 *
		 * Client 1 and Client 2 should now have Ghosts that match.
		 */

		// Two clients that need indexes downloaded
		const bucketX = createBucket();
		bucketX.id = 'x';
		const bucketY = createBucket();
		bucketY.id = 'y';
		const clients = [bucketX, bucketY];

		const responses = await Promise.all( [
			waitForClient( bucketX, () => bucketX.channel.handleMessage( 'auth:user' ) ),
			waitForClient( bucketY, () => bucketY.channel.handleMessage( 'auth:user' ) ),
		] );

		deepEqual(
			Array( 2 ).fill( 'i:1:::10' ),
			responses
		);

		const cvs = await Promise.all( clients.map( client => {
			const indexed = new Promise( resolve => {
				client.once( 'index', resolve );
			} );
			client.channel.handleMessage( 'i:' + JSON.stringify( {
				index: [{
					id: 'note-id',
					v: 1,
					d: { content: 'AC' }
				}],
				current: 'cv-1',
			} ) );
			return indexed;
		} ) );

		deepEqual( Array( 2 ).fill( 'cv-1' ), cvs );

		deepEqual(
			Array( 2 ).fill( { data: { content: 'AC' }, id: 'note-id' } ),
			await Promise.all( clients.map( client => client.get( 'note-id' ) ) ),
		);

		const [changeY, changeX] = ( await Promise.all( [
			waitForClient( bucketY, () => bucketY.update( 'note-id', { content: 'ABC' } ) ),
			waitForClient( bucketX, () => bucketX.update( 'note-id', { content: 'ACD' } ) ),
		] ) ).map( msg => JSON.parse( parseMessage( msg ).data ) );

		equal( '=1\t+B\t=1', changeY.v.content.v );
		equal( '=2\t+D', changeX.v.content.v );

		/**
		 * At this point, both clients have sent a change and are waiting for the
		 * server to respond. Their `localQueue`s should have a `.sent['note-id']`.
		 *
		 * If a client were to update `note-id` at this moment, since it is waiting
		 * for the sent change to be acknowledged by the server it will indicate
		 * that with a `localQueue.queues['note-id']`.
		 */
		const [serverChange1] = [
			[ { cv: 'cv-2', ccids: [changeY.ccid], sv: 1, ev: 2, id: 'note-id', o: 'M', v: { content: {
				o: 'd', v: '=1\t+B\t=1'
			} } } ],
			// This ccid/change is modified by the server, see: '=3\t+D' vs '=2\t+D'
			[ { cv: 'cv-3', ccids: [changeX.ccid], sv: 1, ev: 2, id: 'note-id', o: 'M', v: { content: {
				o: 'd', v: '=3\t+D'
			} } } ],
		];

		const notes = await Promise.all( [
			new Promise( ( resolve, reject ) => {
				bucketY.channel.on( 'acknowledge', () => {
					setTimeout(() => resolve(bucketY.get('note-id')), 10);
				} );

				bucketY.channel.on( 'send', (data) => {
					reject(new Error( 'should not send more things' ) );
				} );

				bucketY.channel.handleMessage( 'c:' + JSON.stringify( serverChange1 ) );
				bucketY.channel.handleMessage('c:' + JSON.stringify(serverChange1));
			} ),
			new Promise( resolve => {
				bucketX.once( 'update', () => resolve( bucketX.get( 'note-id' ) ) );
				bucketX.channel.handleMessage( 'c:' + JSON.stringify( serverChange1 ) );
			} )
		] );

		deepEqual(
			[ 'ABC', 'ABCD' ],
			notes.map( note => note.data.content ),
		)
	} )
} );

function waitForClient( client, action ) {
	const waitFor = new Promise( resolve => {
		client.channel.once( 'send', resolve );
	} );
	action();
	return waitFor;
};

function createBucket() {
	const name = 'notes';
	const bucket = new Bucket( 'notes', mockBucketStore );
	const channel = new Channel(
		'mock-app-id',
		'mock-token',
		defaultGhostStoreProvider( bucket ),
		name
	);
	bucket.setChannel( channel );
	return bucket;
}
