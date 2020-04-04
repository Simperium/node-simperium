// @flow
import events from 'events'
import url from 'url'

import request from './http-request';

// @flow
type User = {
	options: {},
	access_token: string,
};

const fromJSON = ( json: string ): User => {
	const data = JSON.parse( json );
	if ( ! data.access_token && typeof data.access_token !== 'string' ) {
		throw new Error( 'access_token not present' );
	}
	return {
		options: data,
		access_token: new String( data.access_token ).toString()
	};
};

const { EventEmitter } = events;

const baseUrl = 'https://auth.simperium.com/1';

export class AuthError extends Error {
	underlyingError: Error

	constructor( underlyingError: Error ) {
		super( 'Failed to authenticate user.' );
		this.underlyingError = underlyingError;
	}
}

/**
 * Client for creating and authenticating Simperium.com user accounts.
 */
export class Auth extends EventEmitter {
	appId: string
	appSecret: string

	/**
	 * Creates an instance of the Auth client
	 *
	 * @param {string} appId - Simperium.com application ID
	 * @param {string} appSecret - Simperium.com application secret
	 */
	constructor( appId: string, appSecret: string ) {
		super();
		this.appId = appId;
		this.appSecret = appSecret;
	}

	/**
	 * Authorizes a user account with username and password
	 *
	 * @param {string} username account username
	 * @param {string} password account password
	 * @returns {Promise<User>} user account data
	 */
	authorize( username: string, password: string ) {
		const body = JSON.stringify( { username: username, password: password } );
		return this.request( 'authorize/', body );
	}

	create( username: String, password: String, provider: ?String ) {
		const userData: { username: String, password: String, provider?: String } = { username, password };
		if ( provider ) {
			userData.provider = provider;
		}
		const body = JSON.stringify( userData );
		return this.request( 'create/', body );
	}

	getUrlOptions( path: string ) {
		const { port, ...options } = url.parse( `${ baseUrl }/${ this.appId }/${ path }` );
		return (({
			... options,
			port: port ? Number( port ) : undefined,
			method: 'POST',
			headers: {'X-Simperium-API-Key': this.appSecret }
		}: any): URL & { method: string, headers: { [string]: string } });
	}

	request( endpoint: string, body: string ): Promise<User> {
		return request( body, this.getUrlOptions( endpoint ) ).then( response => {
			try {
				const user = fromJSON( response );
				this.emit( 'authorize', user );
				return user;
			} catch ( error ) {
				throw new AuthError( error );
			}
		} )
	}
};

export default ( appId: string, appSecret: string ) => {
	return new Auth( appId, appSecret );
};
