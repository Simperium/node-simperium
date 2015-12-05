import { EventEmitter } from 'events'
import { inherits } from 'util'
import { parseMessage } from '../util'

export default function Channel() {
	EventEmitter.call( this );
	const commands = new EventEmitter();

	this.receive = this.receiveMessage = function( msg ) {
		const { command, data } = parseMessage( msg );
		commands.emit( command, data );
	}

	// TODO: buckets shouldn't handle init commands themselves
	// a bucket instance represents a single connection from a client to
	// a server
	const init = ( msg ) => {
		onInit.call( this, msg, ( user_id, bucket ) => {
			commands.removeListener( 'init', init )
			bucket.on( 'change', onUpdate.bind( this ) )
			commands
				.on( 'i', onIndex.bind( this, bucket ) )
				.on( 'cv', onChangeVersion.bind( this, bucket ) )
				.on( 'c', onChange.bind( this, bucket ) )
		} )
	}
	commands.on( 'init', init )

	this.send = this.emit.bind( this, 'send' );
}

inherits( Channel, EventEmitter );

function onInit( initMsg, onAuthorized ) {
	var params;
	try {
		params = JSON.parse( initMsg );
	} catch ( error ) {
		this.send( 'auth:{"error":"' + error + '"}' )
	}

	this.authorizer( params, ( error, user_id, bucket ) => {
		if ( error ) {
			return this.send( 'auth:{"error":"failed"}' )
		}
		onAuthorized( user_id, bucket )
		this.emit( 'authorized', user_id );
		this.send( 'auth:' + user_id );
	} )
}

function onIndex( bucket, index ) {
	const [includeData, mark, _, count] = index.split( ':' )
	bucket.queryIndex( mark, count, ( current, nextMark, objects ) => {
		var i = { current: current, index: objects };
		if ( nextMark ) {
			i.mark = nextMark;
		}
		this.send( 'i:' + JSON.stringify( i ) )
	} )
}

function onChangeVersion( bucket, cv ) {
	bucket.changesSince( cv, ( error, changes ) => {
		if ( error ) {
			return this.send( 'cv:?' );
		}
		this.send( 'c:' + JSON.stringify( changes ) )
	} )
}

function onChange( bucket, changeMsg ) {
	var change;
	try {
		change = JSON.parse( changeMsg )
	} catch ( e ) {
		return this.send( 'c:?' )
	}
	bucket.applyChange( change, ( e ) => {
		// TODO: respond with change errors
		throw( e )
	} )
}

function onUpdate( change ) {
	this.send( 'c:' + JSON.stringify( [ change ] ) );
}
