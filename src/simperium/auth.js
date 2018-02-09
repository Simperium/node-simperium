// @flow
import events from 'events'
import https from 'https'
import url from 'url'

// @flow
type User = {};

const fromJSON = ( json: string ) => {
	const data = JSON.parse( json );
	return {
		options: data,
		access_token: data.access_token
	};
};

const { EventEmitter } = events;

const URL = 'https://auth.simperium.com/1';

export class AuthError extends Error {
	underlyingError: Error

	constructor( underlyingError: Error ) {
		super( 'Failed to authenticate user.' );
		this.underlyingError = underlyingError;
	}
}

export class Auth extends EventEmitter {
	appId: string
	appSecret: string

	constructor( appId: string, appSecret: string ) {
		super();
		this.appId = appId;
		this.appSecret = appSecret;
	}

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
		const options = url.parse( `${URL}/${ this.appId }/${ path}` );
		return {
			... options,
			method: 'POST',
			headers: {'X-Simperium-API-Key': this.appSecret }
		};
	}

	request( endpoint: string, body: string ): Promise<User> {
		return new Promise( ( resolve, reject ) => {
			const req = https.request( this.getUrlOptions( endpoint ), ( res ) => {
				let responseData = '';

				res.on( 'data', ( data ) => {
					responseData += data.toString();
				} );

				res.on( 'end', () => {
					try {
						const user = fromJSON( responseData );
						resolve( user );
						this.emit( 'authorize', user );
					} catch ( error ) {
						return reject( new AuthError( error ) );
					}
				} );
			} );

			req.on( 'error', ( e ) => {
				reject( e );
			} );

			req.end( body );
		} );
	}
};

export default ( appId: string, appSecret: string ) => {
	return new Auth( appId, appSecret );
};
