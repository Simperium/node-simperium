import { EventEmitter } from 'events'
import { inherits } from 'util'

export default function MockBucket( cv, index, changes ) {
	this.cv = cv;
	this.index = index || {};
	this.changes = changes || [];
	EventEmitter.call( this );
}

inherits( MockBucket, EventEmitter );

MockBucket.prototype.queryIndex = function( mark, count, cb ) {
	var nextMark = null;

	count = parseInt( count );

	if ( isNaN( count ) ) {
		count = this.index.length
	}

	mark = parseInt( mark );

	if ( isNaN( mark ) ) {
		mark = 0;
	}

	if ( mark + count < this.index.length ) {
		nextMark = mark + count;
	}

	cb( this.cv, nextMark, this.index.slice( mark, mark + count ) );
}

MockBucket.prototype.changesSince = function( cv, cb ) {
	var changes = [], found = false, i;
	for ( i = 0; i < this.changes.length; i++ ) {
		found = this.changes[i].cv === cv;
		if ( found ) {
			break;
		}
		changes.unshift( this.changes[i] )
	}

	if ( !found ) {
		return cb( new Error( 'cv not found: ' + cv ) )
	}
	cb( null, changes )
}
