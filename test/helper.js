process.on( 'unhandledRejection', ( promise, reason ) => {
	console.error( 'unhandled rejection', reason );
} );
