import { EventEmitter } from 'events';
import User from './user';
import { format, inherits } from 'util';
import https from 'https';
import url from 'url';

const URL = 'https://auth.simperium.com/1';

export default function Auth( appId, appSecret ) {
	this.appId = appId;
	this.appSecret = appSecret;
}

inherits( Auth, EventEmitter );

Auth.prototype.authorize = function( username, password ) {
	var body = JSON.stringify( {username: username, password: password } ),
		promise = this.request( 'authorize/', body );

	return promise;
};

// TODO: username and password to create a user
Auth.prototype.create = function() {

};

Auth.prototype.getUrlOptions = function( path ) {
	const options = url.parse( format( '%s/%s/%s', URL, this.appId, path ) );
	return Object.assign( options, { method: 'POST', headers: {'X-Simperium-API-Key': this.appSecret}} );
};

Auth.prototype.request = function( endpoint, body ) {
	return new Promise( ( resolve, reject ) => {
		const req = https.request( this.getUrlOptions( endpoint ), ( res ) => {
			var responseData = '';

			res.on( 'data', ( data ) => {
				responseData += data.toString();
			} );

			res.on( 'end', () => {
				var user;

				try {
					user = User.fromJSON( responseData );
				} catch ( e ) {
					return reject( new Error( responseData ) );
				}
				this.emit( 'authorize', user );
				resolve( user );
			} );
		} );

		req.on( 'error', ( e ) => {
			reject( e );
		} );

		req.end( body );
	} );
};
