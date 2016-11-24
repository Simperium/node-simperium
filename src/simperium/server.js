import { server as WebSocketServer } from 'websocket';
import http from 'http';
import { inherits, format } from 'util';
import { EventEmitter } from 'events';
import { parseMessage } from './util';

var datasource = new DataSource();

export default function() {
	const server = http.createServer( function( req, res ) {
		console.log( 'Received request for', + req.url );
		res.writeHead( 404 );
		res.end();
	} );

	const socketServer = new WebSocketServer( {
		httpServer: server,
		autoAcceptConnections: true
	} );

	socketServer
	.on( 'request', function( request ) {
		console.log( 'Accept request?', request );
	} )
	.on( 'connect', function() {
		// var bucket = new Session( connection );
		console.log( 'Connected' );
	} );

	return server;
};

function Session( connection ) {
	this.connection = connection.on( 'message', this.onMessage.bind( this ) );
	this.channels = {};
}

inherits( Session, EventEmitter );

Session.prototype.onMessage = function( msg ) {
	var message = parseMessage( msg.utf8Data ),
		channelId = message.command,
		channel,
		i;

	if ( channelId === 'h' ) {
		i = parseInt( message.data );
		if ( isNaN( i ) ) i = 0;
		this.connection.send( format( 'h:%d', i + 1 ) );
		return;
	}

	channelId = parseInt( channelId );
	// build a channel if we don't have one for the requested channel
	channel = this.getChannel( channelId );
	channel.handleMessage( message.data );
};

Session.prototype.getChannel = function( id ) {
	var channel = this.channels[id],
		connection;

	if ( !channel ) {
		connection = this.connection;
		channel = new Channel( id );
		this.channels[id] = channel;
		channel
		.on( 'send', function( data ) {
			connection.send( format( '%d:%s', id, data ) );
		} )
		.on( 'unauthorized', function() {
			connection.send( format( '%d:auth:%s', id, JSON.stringify( {code: 500} ) ) );
			connection.close();
		} );
	}

	return channel;
};

function Channel( id, settings ) {
	this.settings = settings || {};

	this.settings.bucketAdapter = this.settings.bucketAdapter || defaultBucketAdapter;

	this.id = id;
	this.messages = new EventEmitter();

	this.messages.on( 'init', this.init.bind( this ) );
}

inherits( Channel, EventEmitter );

Channel.prototype.handleMessage = function( data ) {
	var message = parseMessage( data );
	this.messages.emit( message.command, message.data );
};

Channel.prototype.init = function( data ) {
	var options = JSON.parse( data ),
		name = options.name,
		token = options.token,
		emit = this.emit.bind( this );

	// TODO: look up the bucket data source
	// TODO: validate token for bucket
	console.log( 'Time to init', options, name, token );
	this.bucket = this.settings.bucketAdapter();

	this.bucket.initialize( options, function( e, user ) {
		if ( e ) return emit( 'unauthorized', e );
		emit( 'send', format( 'auth:%s', user.email ) );
	} );
};

function defaultBucketAdapter() {
	return new MemoryBucket( datasource );
}

function MemoryBucket( ds ) {
	this.dataSource = ds;
}

MemoryBucket.prototype.initialize = function( settings, callback ) {
	console.log( 'Validate intiailization parameters', settings );
	this.dataSource.authorize( settings.token, function( e, user ) {
		callback( e, user );
	} );
};

function DataSource() {
	this.tokens = {
		'access-token': {
			email: 'email@example.com'
		}
	};
}

DataSource.prototype.authorize = function( token, callback ) {
	var user = this.tokens[token];
	if ( user ) {
		callback( null, user );
	} else {
		callback( new Error( 'User not authorized' ) );
	}
};
