import { EventEmitter } from 'events'
import { inherits } from 'util'
import { parseMessage } from '../util'

export default function Channel() {
	EventEmitter.call( this );
	const commands = new EventEmitter();

	this.receiveMessage = function( msg ) {
		const { command, data } = parseMessage( msg );
		commands.emit( command, data );
	}

	// TODO: buckets shouldn't handle init commands themselves
	// a bucket instance represents a single connection from a client to
	// a server
	commands
	.on( 'init', ( msg ) => {
		this.onInit( msg, ( user_id, bucket ) => {
			bucket.on( 'change', () => {
				// TODO: send the change back to the connection?
			} )
			commands.on( 'i', this.onIndex.bind( this, bucket ) )
		} )
	} )

	this.send = this.emit.bind( this, 'send' );
}

inherits( Channel, EventEmitter );

Channel.prototype.onInit = function( initMsg, onAuthorized ) {
	var params;
	try {
		params = JSON.parse( initMsg );
	} catch ( error ) {
		this.send( 'auth:{"error":"' + error + '"}' )
	}

	const token = { params }

	this.authorizer( token, ( error, user_id, bucket ) => {
		if ( error ) {
			return this.send( 'auth:{"error":"failed"}' )
		}
		onAuthorized( user_id, bucket )
		this.emit( 'authorized', user_id );
		this.send( 'auth:' + user_id );
	} )
}

Channel.prototype.onIndex = function( bucket, index ) {
	const [includeData, mark, _, count] = index.split( ':' )
	bucket.queryIndex( mark, count, ( current, nextMark, objects ) => {
		var i = { current: current, index: objects };
		if ( nextMark ) {
			i.mark = nextMark;
		}
		this.send( 'i:' + JSON.stringify( i ) )
	} )
}
