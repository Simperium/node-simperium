// @flow
import events from 'events';
import { inherits } from 'util';

const { EventEmitter } = events;

export default function Queue() {
	this.queue = [];
	this.running = false;
}

inherits( Queue, EventEmitter );

// Add a function at the end of the queue
Queue.prototype.add = function( fn ) {
	this.queue.push( fn );
	this.start();
	return this;
};

Queue.prototype.start = function() {
	if ( this.running ) return;
	this.running = true;
	this.emit( 'start' );
	setImmediate( this.run.bind( this ) );
}

Queue.prototype.run = function() {
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
