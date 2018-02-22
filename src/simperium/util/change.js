import { v4 as uuid } from 'uuid'
import jsondiff from '../jsondiff'

const changeTypes = {
	MODIFY: 'M',
	REMOVE: '-',
	ADD: '+'
};

const { object_diff, transform_object_diff, apply_object_diff } = jsondiff( {list_diff: false} )

export {
	changeTypes as type,
	buildChange, compressChanges, object_diff as diff,
	rebase as transform,
	modify,
	apply_diff as apply
}

function modify( id, version, patch ) {
	return { o: changeTypes.MODIFY, id: id, ccid: uuid.v4(), v: patch };
}

function buildChange( type, id, object, ghost ) {
	return buildChangeFromOrigin( type, id, ghost.version, object, ghost.data );
}

function buildChangeFromOrigin( type, id, version, target, origin ) {
	var changeData = {
		o: type,
		id: id,
		ccid: uuid.v4()
	};

	// Remove operations have no source version or diff
	if ( type === changeTypes.REMOVE ) return changeData;

	if ( version > 0 ) changeData.sv = version;

	changeData.v = object_diff( origin, target );

	return changeData;
}

function compressChanges( changes, origin ) {
	var modified;

	if ( changes.length === 0 ) {
		return {};
	}

	if ( changes.length === 1 ) {
		return changes[0].v;
	}

	modified = changes.reduce( function( from, change ) {
		// deletes when, any changes after a delete are ignored
		if ( from === null ) return null;
		if ( from.o === changeTypes.REMOVE ) return null;
		return apply_object_diff( from, change.v );
	}, origin );

	if ( modified === null ) return null;

	return object_diff( origin, modified );
}

function rebase( local_diff, remote_diff, origin ) {
	return transform_object_diff( local_diff, remote_diff, origin );
}

function apply_diff( patch, object ) {
	return apply_object_diff( object, patch );
}
