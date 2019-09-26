import { Heartbeat } from '../../src/simperium/client';

import { equal } from 'assert';

describe( 'Heartbeat', () => {
	it( 'timeouts', ( done ) => {
		// If the heartbeat does not "tick" within
		// the given time, it will emit a `timeout`
		// This indicates that the client has not received
		// a heartbeat message from simperium
		const heartbeat = new Heartbeat( 0.03 );

		heartbeat.once( 'timeout', () => {
			heartbeat.stop();
			done();
		} );

		heartbeat.start();
	} );

	it( 'ticks', ( done ) => {
		// When the heartbeat is "ticked" by a simperium
		// network message it increments its counter and
		// emits a 'beat'
		const heartbeat = new Heartbeat( 0.03, ( count ) => {
			equal( count, 501 );
			done();
			heartbeat.stop();
		} );

		heartbeat.start();
		heartbeat.tick( 500 )
	} )
} );
