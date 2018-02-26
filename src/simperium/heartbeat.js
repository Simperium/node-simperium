// @flow

export default class Heartbeat {
	count: number
	seconds: number
	timeout: TimeoutID
	timer: TimeoutID
	onBeat: number => void
	onTimeout: () => void

	constructor( seconds: number, onBeat: number => void, onTimeout: () => void ) {
		this.count = 0;
		this.seconds = seconds;
		this.onBeat = onBeat;
		this.onTimeout = onTimeout;
	}

	beat() {
		this.count ++;

		this.timeout = setTimeout( this.onTimeout.bind( this ), this.seconds * 1000 * 2 );
		this.onBeat( this.count );
	}

	onTimeout() {
		this.onTimeout();
		this.stop();
	}

	tick( count?: number ) {
		if ( count && count > 0 ) {
			this.count = count;
		}
		this.start();
	}

	start() {
		this.stop();
		this.timer = setTimeout( this.beat.bind( this ), this.seconds * 1000 );
	}

	stop() {
		clearTimeout( this.timer );
		clearTimeout( this.timeout );
	}
}