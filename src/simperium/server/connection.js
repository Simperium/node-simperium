import Channel from './channel'
import { EventEmitter } from 'events'
import { inherits } from 'util'
import { parseMessage } from '../util'

export default function Connection() {
	const commands = new EventEmitter()
	const channels = {}

	EventEmitter.call( this )

	this.receive = ( msg ) => {
		const { command, data } = parseMessage( msg )
		const channelId = parseInt( command )
		var channel;

		if ( isNaN( channelId ) ) {
			return commands.emit( command, data )
		}

		if ( ! channels[channelId] ) {
			channel = channels[channelId] = new Channel()
			channel.authorizer = this.authorizer
			channel.on( 'send', ( channelMsg ) => {
				this.send( channelId + ':' + channelMsg )
			} )
			this.emit( 'openchannel', channelId, channel )
		} else {
			channel = channels[channelId];
		}

		// send the message to the channel
		channel.receive( data )
	}

	this.send = this.emit.bind( this, 'send' )

	commands.on( 'h', onHeartbeat.bind( this ) )
}

inherits( Connection, EventEmitter )

function onHeartbeat( countMsg ) {
	const count = parseInt( countMsg )
	if ( isNaN( count ) ) {
		this.send( 'h:1' )
	} else {
		this.send( 'h:' + ( count + 1 ) )
	}
}
