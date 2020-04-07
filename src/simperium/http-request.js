// @flow
import https from 'https'

export default function(
	apiKey: string,
	url: string,
	body: string,
): Promise<string> {
	return new Promise( ( resolve, reject ) => {
		const headers = {
			'X-Simperium-API-Key': apiKey
		};

		const req = https.request( url, { method: 'POST', headers }, res => {
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
