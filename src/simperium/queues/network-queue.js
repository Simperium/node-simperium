// @flow
import Queue from './queue';

export default class NetworkQueue {
	constructor() {
		this.queues = {};
	}

	queueFor( id ) {
		const queues: { [string]: ?Queue } = this.queues;
		let queue: ?Queue = queues[id];

		if ( !queue ) {
			queue = new Queue();
			queue.on( 'finish', function() {
				delete queues[id];
			} );
			queues[id] = queue;
		}

		return queue;
	}
}
