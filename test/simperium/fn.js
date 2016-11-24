export { when, counts, debounce, times };

function when( check, fn ) {
	var args = [].slice.call( arguments, 2 );

	return function() {
		if ( check() ) return fn.apply( this, args.concat( [].slice.call( arguments ) ) );
	};
}

function debounce( every, fn ) {
	var args = [].slice.call( arguments, 2 ),
		count = 0,
		debouncer = function() {
			count ++;
			return count % every === 0;
		};

	return when.apply( this, [debouncer, fn].concat( args ) );
}

function counts( total, fn ) {
	var args = [].slice.call( arguments, 2 ),
		count = 0,
		counter = function() {
			if ( count === total ) return true;
			count ++;
			return false;
		};

	return when.apply( this, [counter, fn].concat( args ) );
}

function times( count, fn ) {
	var args = [].slice.call( arguments, 2 ),
		multiple = function() {
			var results = [], i;
			for ( i = 0; i < count; i++ ) {
				results.push( fn.apply( this, args ) );
			}
			return results;
		};

	return multiple;
}
