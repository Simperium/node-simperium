// @flow
export default function(
	body: string,
	options: URL & { method: string, headers: { [ string ]: string } }
): Promise<string> {
	return new Promise( ( resolve, reject ) => {
		const xhr = new XMLHttpRequest();

		xhr.open( options.method, options.href );
		xhr.setRequestHeader(
			'X-Simperium-API-Key',
			options.headers[ 'X-Simperium-API-Key' ]
		);

		xhr.onload = () => resolve( xhr.responseText );
		xhr.onerror = () => reject();

		xhr.send( body );
	} );
}
