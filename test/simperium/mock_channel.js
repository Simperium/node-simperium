import { EventEmitter } from 'events'
import util from 'util'
import simperiumUtil from 'simperium/util'

var MockChannel = module.exports = function() {
	this.acknowledger = ( function( data ) {
		var change = JSON.parse( data ),
			ack = {
				id: change.id,
				o: change.o,
				v: change.v,
				ev: change.sv ? change.sv + 1 : 0,
				ccids: [change.ccid]
			};

		if ( change.sv ) {
			ack.svn = change.sv;
		}

		this.emit( 'change', change.id, ack );
	} ).bind( this );
	EventEmitter.call( this );
};

util.inherits( MockChannel, EventEmitter );

MockChannel.prototype.send = function( data ) {
	var message = simperiumUtil.parseMessage( data );
	this.emit( 'send', data );
	this.emit( util.format( 'command.%s', message.command ), message.data );
};

MockChannel.prototype.autoAcknowledge = function() {
	this.on( 'command.c', this.acknowledger );
};

MockChannel.prototype.disableAutoAcknowledge = function() {
	this.off( 'command.c', this.acknowledger );
};
