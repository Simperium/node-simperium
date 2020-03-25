// @flow
import { request } from 'https'

export default function( endpoint, body, options ) {
    return new Promise( ( resolve, reject ) => {
        const req = request( options, res => {
            let responseData = '';

            res.on( 'data', data => {
                responseData += data.toString();
            } );

            res.on( 'end', () => {
                resolve( responseData );
            } );
        } );

        req.on( 'error', ( e ) => {
            reject( e );
        } );

        req.end( body );
    } );
}

