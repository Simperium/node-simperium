import Auth from '../../src/simperium/auth'
import https from 'https'
import { equal, deepEqual, fail, throws } from 'assert'
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

const assertThrows = async ( promise, matchesMessage = undefined ) => {
	let result = null;
	try {
		result = await promise;
	} catch ( error ) {
		throws( () => {
			throw error
		}, matchesMessage );
		return;
	}
	fail( null, result, 'error not thrown' );
}

describe( 'Auth', () => {
	var auth

	beforeEach( () => {
		auth = new Auth( 'token', 'secret' );
	} )

	it( 'getUrlOptions', () => {
		const { hostname, headers, pathname, method } = auth.getUrlOptions( 'path' )
		equal( method, 'POST' )
		equal( hostname, 'auth.simperium.com' )
		equal( pathname, '/1/token/path' )
		deepEqual( headers, { 'X-Simperium-API-Key': 'secret' } )
	} )

	it( 'should request auth token', async () => {
		stub( ( data, handler ) => {
			const { username, password } = JSON.parse( data )
			const response = new EventEmitter()
			equal( username, 'username' )
			equal( password, 'password' )

			handler( response )
			response.emit( 'data', '{\"access_token\": \"secret-token\"}' )
			response.emit( 'end' );
		} )

		const user = await auth.authorize( 'username', 'password' );
		equal( user.access_token, 'secret-token' );
	} )

	it( 'should fail to auth with invalid credentials', async () => {
		stubResponse( 'this is not json' );

		await assertThrows(
			auth.authorize( 'username', 'bad-password' ),
			/this is not json/
		);
	} )

	it( 'should create an account with valid credentials', async () => {
		stub( ( data, handler ) => {
			const { username, password } = JSON.parse( data )
			const response = new EventEmitter()
			equal( username, 'username' )
			equal( password, 'password' )

			handler( response )
			response.emit( 'data', '{\"access_token\": \"secret-token\"}' )
			response.emit( 'end' );
		} )

		const user = await auth.create( 'username', 'password' )
		equal( user.access_token, 'secret-token' )
	} )

	it( 'should fail to create an account with invalid credentials', async () => {
		stubResponse( 'this is not json' )

		await assertThrows(
			auth.create( 'username', 'bad-password' ),
			'this is not json'
		);
	} )
} )
