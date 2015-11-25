import { EventEmitter } from 'events'
import User from './user'
import { format, inherits } from 'util'
import https from 'https'
import url from 'url'
import Promise from 'promise'

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
}

Auth.prototype.create = function( username, password ) {

}

Auth.prototype.getUrlOptions = function( path ) {
	const options = url.parse( format( '%s/%s/%s', URL, this.appId, path ) );
	return Object.extend( options, { method: 'POST', headers: {'X-Simperium-API-Key': this.appSecret}} );
}

Auth.prototype.request = function( endpoint, body ) {
	return new Promise( ( resolve, reject ) => {
		const req = https.request( self.getUrlOptions( endpoint ), ( res ) => {
			var responseData = '';

			res.on( 'data', ( data ) => {
				responseData += data.toString();
			} );

			res.on( 'end', () => {
				var user = User.fromJSON( responseData );
				this.emit( 'authorize', user );
				resolve( user );
			} );
		} );

		req.on( 'error', ( e ) => {
			reject( e );
		} );

		req.end( body );
	} );
}
