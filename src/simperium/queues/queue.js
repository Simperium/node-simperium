// @flow
import events from 'events';

const { EventEmitter } = events;

type Task = ( onComplete: () => void ) => void

export default class Queue extends EventEmitter {
	queue: Task[];
	running: boolean
	constructor() {
		super();
		this.queue = [];
		this.running = false;
	}
	/**
	 * Add a task to the queue. THe queue will start if it has not been started
	 * @param {Task} task - the task to execute
	 * @returns {Queue} the queue instance for chaining
	 */
	add( task: Task ) {
		this.queue.push( task );
		this.start();
		return this;
	};

	/**
	 * Begins processing tasks if the queue is not already running
	 * @emits 'start'
	 */
	start() {
		if ( this.running ) return;
		this.running = true;
		this.emit( 'start' );
		setImmediate( this.run.bind( this ) );
	}

	/**
	 * Runs the next action on the queue
	 * @emits finish - when all tasks are completed
	 * @private
	 */
	run() {
		this.running = true;

		if ( this.queue.length === 0 ) {
			this.running = false;
			this.emit( 'finish' );
			return;
		}

		const task = this.queue.shift();
		task( () => this.run() );
	}
}
