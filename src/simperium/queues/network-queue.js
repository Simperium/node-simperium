// @flow
import Queue from './queue';

/**
 * Stores a mapping of Queue objects to bucket object ids
 */
export default class NetworkQueue {
	queues: { [bucketObjectID: string]: ?Queue };

	constructor() {
		this.queues = {};
	}

	/**
	 * Retrieve the queue for the given bucket object id
	 *
	 * @param {string} id - the bucket object id to retrieve the queue for
	 * @return {Queue} the queue for the giver bucket object, creates a new queue if none exists
	 */
	queueFor( id: string ) {
		let queue: ?Queue = this.queues[id];

		if ( !queue ) {
			queue = new Queue();
			queue.on( 'finish', () => {
				delete this.queues[id];
			} );
			this.queues[id] = queue;
		}

		return queue;
	}
}
