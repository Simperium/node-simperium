import { EventEmitter } from 'events';

export class MockChannel extends EventEmitter {
	update( object ) {
		return Promise.resolve( object );
	}

	getVersion() {
		return Promise.resolve( 0 );
	}

	remove() {
	}

	subscribe( subscriber ) {
		this.subscriber = subscriber;
	}
};
