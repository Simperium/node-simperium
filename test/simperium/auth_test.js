import buildAuth from '../../src/simperium/auth'
import https from 'https'
import { equal, deepEqual } from 'assert'
import { EventEmitter } from 'events'

const stub = ( respond ) => {
	https.request = ( options, handler ) => {
		const req = new EventEmitter()
		req.end = ( body ) => respond( body, handler )
		return req
	}
}

const stubResponse = ( data ) => stub( ( body, handler ) => {
	const response = new EventEmitter()
	handler( response )
	response.emit( 'data', data )
	response.emit( 'end' )
} )

describe( 'Auth', () => {
	let auth;

	beforeEach( () => {
		auth = buildAuth( 'token', 'secret' );
	} );

	it( 'getUrlOptions', () => {
		const { hostname, headers, pathname, method } = auth.getUrlOptions( 'path' )
		equal( method, 'POST' )
		equal( hostname, 'auth.simperium.com' )
		equal( pathname, '/1/token/path' )
		deepEqual( headers, { 'X-Simperium-API-Key': 'secret' } )
	} )

	it( 'should request auth token', () => {
		stub( ( data, handler ) => {
			const { username, password } = JSON.parse( data )
			const response = new EventEmitter()
			equal( username, 'username' )
			equal( password, 'password' )

			handler( response )
			response.emit( 'data', '{\"access_token\": \"secret-token\"}' )
			response.emit( 'end' );
		} )

		return auth.authorize( 'username', 'password' )
			.then( ( user ) => {
				equal( user.access_token, 'secret-token' );
			} );
	} );

	it( 'should fail if missing access_token', () => {
		stubResponse( '{"hello":"world"}' );
		return auth.authorize( 'username', 'password' )
			.catch( error => {
				equal( error.message, 'Failed to authenticate user.' );
				equal( error.underlyingError.message, 'access_token not present' );
			} );
	} );

	it( 'should fail to auth with invalid credentials', () => {
		stubResponse( 'this is not json' )

		return auth.authorize( 'username', 'bad-password' )
			.catch( ( e ) => {
				equal( e.message, 'Failed to authenticate user.' );
			} );
	} )

	it( 'should create an account with valid credentials', () => {
		stub( ( data, handler ) => {
			const { username, password } = JSON.parse( data )
			const response = new EventEmitter()
			equal( username, 'username' )
			equal( password, 'password' )

			handler( response )
			response.emit( 'data', '{\"access_token\": \"secret-token\"}' )
			response.emit( 'end' );
		} )

		return auth.create( 'username', 'password' )
			.then( user => {
				equal( user.access_token, 'secret-token' )
			} );
	} )

	it( 'should fail to create an account with invalid credentials', () => {
		stubResponse( 'this is not json' )

		return auth.create( 'username', 'bad-password' )
			.catch( ( e ) => {
				equal( e.message, 'Failed to authenticate user.' );
			} );
	} )
} )
