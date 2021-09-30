// @flow
export default function(
	apiKey: string,
	url: string,
	body: string
): Promise<string> {
	return new Promise( ( resolve, reject ) => {
		const xhr = new XMLHttpRequest();

		xhr.open( 'POST', url );
		xhr.setRequestHeader( 'X-Simperium-API-Key', apiKey );

		xhr.onload = () => {
			const message = xhr.status === 429 && xhr.responseText === ''
				? 'too many requests'
				: xhr.responseText;
			resolve(message);
		};
		xhr.onerror = () => reject();

		xhr.send( body );
	} );
}
