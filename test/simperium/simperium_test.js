import { util } from '../../src/simperium';
import assert from 'assert';

describe( 'Simperium', () => {
	it( 'should export utils', () => {
		assert( util );
		assert( util.change );
		assert.equal( typeof util.change.diff, 'function' );
	} );
} );
