import assert from 'assert'
import * as fn from '../../src/simperium/util/fn'

describe( 'util.fn', function() {
	describe( 'when', function() {
		it( 'should execute when callback return true', function() {
			var fire = function() {
					return true;
				},
				shouldFire = false,
				check = function() {
					return shouldFire;
				},
				ifShouldFire = fn.when( check, fire );

			assert.ok( !ifShouldFire() );

			shouldFire = true;

			assert.ok( ifShouldFire() );
		} );
	} );

	describe( 'times', function() {
		it( 'should execute x times and return each result', function() {
			var add = function( a, b ) {
					return a + b;
				},
				times = fn.times( 3, add, 1, 2 );

			assert.deepEqual( times(), [3, 3, 3] );
		} );
	} );

	describe( 'counts', function() {
		it( 'should only execute when fired the requested times', function() {
			var fire = function() {
					return true;
				},
				counts = fn.counts( 3, fire ),
				i;

			for ( i = 0; i < 3; i++ ) {
				assert.ok( !counts() );
			}

			assert.ok( counts() );
		} );
	} );

	describe( 'debounce', function() {
		it( 'should only fire every x times', function() {
			var count = 0,
				fire = function() {
					count ++;
					return true;
				},
				debounced = fn.debounce( 10, fire ),
				i;

			for ( i = 0; i < 109; i++ ) {
				debounced();
			}

			assert.equal( count, 10 );

			assert.ok( debounced() );

			assert.equal( count, 11 );
		} );
	} );
} );
