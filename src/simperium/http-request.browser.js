export default function( endpoint, body, options ) {
    return new Promise( ( resolve, reject ) => {
        const xhr = new XMLHttpRequest();

        xhr.open( 'POST', endpoint );
        xhr.setRequestHeader( 'X-Simperium-API-Key', options.headers['X-Simperium-API-Key'] );

        xhr.onload = () => resolve( xhr.responseText );
        xhr.onerror = () => reject();

        xhr.send( body );
    } );
}