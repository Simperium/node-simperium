// @flow
import uuid from 'uuid/v4'
import jsondiff from '../jsondiff'
import type { ObjectOperationSet } from '../jsondiff';

export type BucketChangeType = 'M' | '-';

const changeTypes: { [name: string]: BucketChangeType } = {
	MODIFY: 'M',
	REMOVE: '-'
};

const { object_diff, transform_object_diff, apply_object_diff } = jsondiff( {list_diff: false} )

export {
	changeTypes as type,
	buildChange, compressChanges, object_diff as diff,
	rebase as transform,
	modify,
	apply_diff as apply
}

function modify( id: string, version: number, patch: {} ) {
	return { o: changeTypes.MODIFY, id: id, ccid: uuid(), v: patch };
}

function buildChange( type: BucketChangeType, id: string, object: {}, ghost: {| version: number, data: {} |} ) {
	return buildChangeFromOrigin( type, id, ghost.version, object, ghost.data );
}

export type ModifyChange = {
	o: 'M',
	id: string,
	ccid: string,
	v: ObjectOperationSet,
	sv?: number
}

export type RemoveChange = {
	o: '-',
	id: string,
	ccid: string
}

export type Change = ModifyChange | RemoveChange;

function buildChangeFromOrigin( type: BucketChangeType, id: string, version: number, target: {}, origin: {} ): Change {

	if ( type === changeTypes.REMOVE ) {
		return {
			o: '-',
			id,
			ccid: uuid()
		};
	}


	const change: ModifyChange = {
		o: 'M',
		id,
		ccid: uuid(),
		v: object_diff( origin, target )
	}

	if ( version > 0 ) {
		change.sv = version;
	}
	return change;
}

function compressChanges( changes: Array<Change>, origin: {} ): ?ObjectOperationSet {
	var modified;

	if ( changes.length === 0 ) {
		return {};
	}

	if ( changes.length === 1 ) {
		const change: Change = changes[0];
		if ( change.o === 'M' ) {
			return change.v;
		}
		return null;
	}

	modified = changes.reduce( function( from, change ) {
		// deletes when, any changes after a delete are ignored
		if ( from === null ) return null;
		if ( change.o === '-' ) return null;
		return apply_object_diff( from, change.v );
	}, origin );

	if ( modified === null ) return null;

	return object_diff( origin, modified );
}

function rebase( local_diff: ObjectOperationSet, remote_diff: ObjectOperationSet, origin: {} ) {
	return transform_object_diff( local_diff, remote_diff, origin );
}

function apply_diff( patch: Change, object: {} ) {
	return apply_object_diff( object, patch );
}
