var babel = require( 'babel-core' );
var path = require( 'path' );
var find = require( 'find' ).file;
var fs = require( 'fs' );

// Get a list of all source files
var ROOT_DIR = path.join( __dirname, '/../' );
var SRC_DIR = path.join( ROOT_DIR, 'src' );
var LIB_DIR = path.join( ROOT_DIR, 'lib' );

find( SRC_DIR, function( files ) {
	files.forEach( function( file ) {
		var src = file;
		var dst = path.join( LIB_DIR, file.slice( SRC_DIR.length ) );
		var result = babel.transformFileSync( src, { presets: ['es2015']} );

		var paths = path.join( dst, '/../' ).slice( ROOT_DIR.length ).split( '/' );

		paths.reduce( function( parent, fragment ) {
			var dir = path.join( parent, fragment );
			if ( fragment === '' ) {
				return parent;
			}
			try {
				fs.mkdirSync( dir );
			} catch ( e ) {
				if ( e.code !== 'EEXIST' ) {
					console.warn( 'failed to mkdir', dir, e );
				}
			}
			return dir;
		}, ROOT_DIR );

		fs.writeFileSync( dst, result.code );
	} );
} );
