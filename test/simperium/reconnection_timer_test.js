import { ReconnectionTimer } from '../../src/simperium/client';

import { equal } from 'assert';

describe( 'ReconnectionTimer', () => {
	it( 'increments the interval', ( done ) => {
		let current = 0;
		const timer = new ReconnectionTimer( () => 30, ( attempt ) => {
			equal( current, attempt )
			current += 1;

			if ( current === 3 ) {
				timer.stop();
				done();
			} else {
				timer.start();
			}
		} );

		timer.start();
	} );

	it( 'uses a default interval', () => {
		const timer = new ReconnectionTimer();
		equal( 1000, timer.interval() );
	} );

	it( 'restart resets the interval and starts the timer', ( done ) => {
		const timer = new ReconnectionTimer( () => 0.3, ( attempt ) => {
			equal( 0, attempt );
			done();
		} );

		timer.attempt = 1000;
		timer.restart();
	} )
} );
