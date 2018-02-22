import { EventEmitter } from 'events';

export class MockChannel extends EventEmitter {
	update() {
		// noop
	}

	getVersion() {
		return Promise.resolve( 0 );
	}

	remove() {
	}
};
