// @flow
import Queue from './queue';

export default function NetworkQueue() {
	this.queues = {};
}

NetworkQueue.prototype.queueFor = function( id ) {
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
};
