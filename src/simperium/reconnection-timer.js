export default class ReconnectionTimer {
	started: boolean
	interval: number => number;
	timer: TimeoutID;
	attempt: number;
	onTripped: number => void;

	constructor( interval: number => number, onTripped: number => void ) {
		this.started = false;

		this.interval = interval || ( () => 1000 );

		this.onTripped = onTripped;

		this.reset();
	}

	onInterval() {
		this.onTripped( this.attempt );
		this.attempt ++;
	};

	start() {
		this.started = true;
		this.timer = setTimeout( this.onInterval.bind( this ), this.interval( this.attempt ) );
	};

	restart() {
		this.reset();
		this.start();
	};

	stop() {
		this.attempt = 0;
		this.started = false;
		clearTimeout( this.timer );
	}
	reset() {
		this.stop();
	}
}