
export default function( data ) {
	let dataMark = data.indexOf( '\n' ),
		versionMark = data.indexOf( '.' ),
		id = data.slice( 0, versionMark ),
		version = parseInt( data.slice( versionMark + 1, dataMark ) ),
		payload = JSON.parse( data.slice( dataMark + 1 ) );

	return {
		data: payload.data,
		id: id,
		version: version
	};
}
