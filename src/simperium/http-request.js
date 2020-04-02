// @flow
import https from 'https'

export default function(
	body: string,
	options: URL & { method: string; headers: { [string]: string } }
): Promise<string> {
	return new Promise( ( resolve, reject ) => {
		const req = https.request( options, res => {
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

