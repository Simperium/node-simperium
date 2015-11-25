import Auth from '../../lib/simperium/auth'
import https from 'https'
import assert from 'assert'
import { EventEmitter } from 'events'

const requests = new EventEmitter();

https.request = function( options, handler ) {
	requests.emit( 'opened', options, handler );
	const req = new EventEmitter();

	req.end = function( msg ) {
		requests.emit( 'body', msg, handler );
	}

	return req;
}

describe( 'Auth', () => {
	var auth;

	beforeEach( () => {
		auth = new Auth( 'token', 'secret' );
	} )

	it( 'getUrlOptions', () => {
		const { hostname, headers, pathname, method } = auth.getUrlOptions( 'path' )
		assert.equal( method, 'POST' )
		assert.equal( hostname, 'auth.simperium.com' )
		assert.equal( pathname, '/1/token/path' )
		assert.deepEqual( headers, { 'X-Simperium-API-Key': 'secret' } )
	} )

	it( 'should request auth token', ( done ) => {
		requests.on( 'opened', ( options ) => {
			const { pathname } = options;
			assert.equal( pathname, '/1/token/authorize/' )
		} )

		requests.on( 'body', ( data, handler ) => {
			const { username, password } = JSON.parse( data )
			const response = new EventEmitter()
			assert.equal( username, 'username' )
			assert.equal( password, 'password' )

			handler( response )
			response.emit( 'data', '{\"access_token\": \"secret-token\"}' )
			response.emit( 'end' );
		} )

		auth.authorize( 'username', 'password' )
		.then( ( user ) => {
			assert.equal( user.access_token, 'secret-token' )
			done()
		} )
		.catch( done )
	} )
} )
