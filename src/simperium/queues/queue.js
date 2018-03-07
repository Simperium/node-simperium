// @flow
import events from 'events';

const { EventEmitter } = events;

export default class Queue extends EventEmitter {
	constructor() {
		super();
		this.queue = [];
		this.running = false;
	}

	// Add a function at the end of the queue
	add( fn ) {
		this.queue.push( fn );
		this.start();
		return this;
	};

	start() {
		if ( this.running ) return;
		this.running = true;
		this.emit( 'start' );
		setImmediate( this.run.bind( this ) );
	}

	run() {
		var fn;
		this.running = true;

		if ( this.queue.length === 0 ) {
			this.running = false;
			this.emit( 'finish' );
			return;
		}

		fn = this.queue.shift();
		fn( this.run.bind( this ) );
	}
}
