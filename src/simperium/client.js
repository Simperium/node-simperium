import { format, inherits } from 'util'
import { EventEmitter } from 'events'
import Bucket from './bucket'
import Channel from './channel'
import defaultGhostStoreProvider from './ghost/default'
import defaultObjectStoreProvider from './storage/default'

var WebSocketClient;
if ( typeof window !== 'undefined' && window.WebSocket ) {
	WebSocketClient = window.WebSocket;
} else {
	WebSocketClient = require( 'websocket' ).w3cwebsocket;
}

export { Bucket, Channel }

export default function Client( appId, accessToken, options ) {
	options = options || {};

	options.ghostStoreProvider = options.ghostStoreProvider || defaultGhostStoreProvider;
	options.objectStoreProvider = options.objectStoreProvider || defaultObjectStoreProvider;
	options.hearbeatInterval = options.heartbeatInterval || 4;

	this.accessToken = accessToken;
	this.open = false;
	this.options = options;

	this.heartbeat = new Heartbeat( options.hearbeatInterval, this.sendHeartbeat.bind( this ) );

	this.heartbeat.on( 'timeout', this.onConnectionTimeout.bind( this ) );

	this.reconnectionTimer = new ReconnectionTimer( function( attempt ) {
		var time = ( attempt >= 3 ? ( attempt - 3 ) * 3000 : 0 ) + 3000;
		return time;
	}, this.onReconnect.bind( this ) );

	this.appId = appId;

	options.url = options.url || format( 'wss://api.simperium.com/sock/1/%s/websocket', this.appId );

	this.reconnect = true;

	this.on( 'message:h', this.onHeartbeat.bind( this ) );

	this.buckets = [];

	this.connect();
}

inherits( Client, EventEmitter );

Client.prototype.bucket = function( name ) {
	var channelId = this.buckets.length,
		bucket = new Bucket( name, this.options.objectStoreProvider ),
		channel = new Channel( this.appId, this.accessToken, bucket, this.options.ghostStoreProvider( bucket ) ),
		send = this.sendChannelMessage.bind( this, channelId ),
		receive = channel.handleMessage.bind( channel );

	this.buckets.push( bucket );

	channel.on( 'unauthorized', this.onUnauthorized.bind( this ) );
	channel.on( 'send', send );

	this.on( 'connect', channel.onConnect.bind( channel ) );
	this.on( format( 'channel:%d', channelId ), receive );
	this.on( 'access-token', function( token ) {
		channel.access_token = token;
	} );

	if ( this.open ) channel.onConnect();

	return bucket;
};

Client.prototype.onHeartbeat = function( message ) {
	var counter = parseInt( message );
	this.heartbeat.tick( counter );
};

Client.prototype.onConnect = function() {
	this.open = true;

	this.emit( 'connect' );

	this.heartbeat.start();
	this.reconnectionTimer.reset();
};

Client.prototype.onReconnect = function( attempt ) {
	this.emit( 'reconnect', attempt );
	this.connect();
};

Client.prototype.onConnectionTimeout = function() {
	this.disconnect();
};

Client.prototype.onConnectionFailed = function() {
	this.emit( 'disconnect' );
	if ( this.reconnect ) this.reconnectionTimer.start();
};

Client.prototype.onMessage = function( message ) {
	this.parseMessage( message );
	this.heartbeat.tick();
};

Client.prototype.onUnauthorized = function( details ) {
	this.reconnect = false;
	this.emit( 'unauthorized', details );
};

Client.prototype.parseMessage = function( event ) {
	var data = event.data,
		marker = data.indexOf( ':' ),
		prefix = data.slice( 0, marker ),
		channelId = parseInt( prefix ),
		channelMessage = data.slice( marker + 1 );

	this.emit( 'message', data );

	if ( isNaN( channelId ) ) {
		this.emit( format( 'message:%s', prefix ), channelMessage );
	} else {
		this.emit( format( 'channel:%d', channelId ), channelMessage );
	}
};

Client.prototype.sendHeartbeat = function( count ) {
	this.send( format( 'h:%d', count ) );
};

Client.prototype.send = function( data ) {
	this.emit( 'send', data );
	try {
		this.socket.send( data );
	} catch ( e ) {
		// failed to send, probably not connected
	}
};

Client.prototype.sendChannelMessage = function( id, message ) {
	this.send( format( '%d:%s', id, message ) );
};

Client.prototype.connect = function() {
	this.reconnect = true;
	this.socket = new WebSocketClient( this.options.url );

	this.socket.onopen = this.onConnect.bind( this );
	this.socket.onmessage = this.onMessage.bind( this );
	this.socket.onclose = this.onConnectionFailed.bind( this );
};

Client.prototype.disconnect = function() {
	if ( this.open ) {
		this.socket.close();
	} else {
		this.onClose();
	}
};

Client.prototype.end = function() {
	this.reconnect = false;
	this.reconnectionTimer.stop();
	this.disconnect();
};

Client.prototype.onClose = function() {
	this.connection = null;
	this.heartbeat.stop();
	if ( this.reconnect !== false ) this.reconnectionTimer.start();
	this.emit( 'close' );
};

Client.prototype.setAccessToken = function( token ) {
	this.accessToken = token;
	this.emit( 'access-token', token );
	this.connect();
};

function Heartbeat( seconds, onBeat ) {
	this.count = 0;
	this.seconds = seconds;
	EventEmitter.call( this );

	if ( onBeat ) this.on( 'beat', onBeat );
}

inherits( Heartbeat, EventEmitter );

Heartbeat.prototype.onBeat = function() {
	this.count ++;

	this.timeout = setTimeout( this.onTimeout.bind( this ), this.seconds * 1000 * 2 );
	this.emit( 'beat', this.count );
};

Heartbeat.prototype.onTimeout = function() {
	this.emit( 'timeout' );
	this.stop();
};

Heartbeat.prototype.tick = function( count ) {
	if ( count > 0 && typeof count === 'number' ) {
		this.count = count;
	}
	this.start();
};

Heartbeat.prototype.start = function() {
	this.stop();
	this.timer = setTimeout( this.onBeat.bind( this ), this.seconds * 1000 );
};

Heartbeat.prototype.stop = function() {
	clearTimeout( this.timer );
	clearTimeout( this.timeout );
};

function ReconnectionTimer( interval, onTripped ) {
	EventEmitter.call( this );

	this.started = false;

	this.interval = interval || function() {
		return 1000;
	};

	if ( onTripped ) this.on( 'tripped', onTripped );

	this.reset();
}

inherits( ReconnectionTimer, EventEmitter );

ReconnectionTimer.prototype.onInterval = function() {
	this.emit( 'tripped', this.attempt );
	this.attempt ++;
};

ReconnectionTimer.prototype.start = function() {
	this.started = true;
	this.timer = setTimeout( this.onInterval.bind( this ), this.interval( this.attempt ) );
};

ReconnectionTimer.prototype.restart = function() {
	this.reset();
	this.start();
};

ReconnectionTimer.prototype.reset = ReconnectionTimer.prototype.stop = function() {
	this.attempt = 0;
	this.started = false;
	clearTimeout( this.timer );
};
