// @flow
import uuid from 'uuid/v4'
import jsondiff from '../jsondiff'
import type { ObjectOperationSet } from '../jsondiff';

/**
 * Valid change types for bucket operations
 */
export type BucketChangeType = '-' | 'M';

/**
 * Identifies an object within a bucket on simperium
 */
type BucketObjectID = string
/**
 * Identifies a unique change operation that a client sends to simperium
 */
type ChangeID = string
/**
 * A more descriptive type for the modifications present in a
 * bucket change operation.
 */
type BucketObjectModification = ObjectOperationSet

/**
 * An operation that modifies an object within a bucket.
 */
type BucketModifyOperation = {
	o: 'M',
	id: BucketObjectID,
	ccid: ChangeID,
	v: BucketObjectModification,
	sv?: number
}

/**
 * An operation that deletes an object from a bucket.
 */
type BucketRemoveOperation = {
	o: '-',
	id: BucketObjectID,
	ccid: ChangeID
}

/**
 * Union type of the two possible operations that can modify data inside
 * a bucket.
 */
export type BucketOperation = BucketModifyOperation | BucketRemoveOperation;

const { transform_object_diff, apply_object_diff, object_diff } = jsondiff;

const changeTypes: { [name: string]: BucketChangeType } = {
	MODIFY: 'M',
	REMOVE: '-'
};

export {
	changeTypes as type,
	buildChange, compressChanges, object_diff as diff,
	rebase as transform,
	modify,
	apply_diff as apply
}

/**
 * Creates a BucketModifyOperation that can be sent to simperium.
 *
 * @param { string } id - Bucket object id
 * @param { number } version - the version number of the object to be modified
 * @param { {} } patch - the set of operations to be applied to the object at the given version
 * @returns { {} } a bucket change operation that can be sent to simperium
 */
function modify( id: BucketObjectID, version: number, patch: BucketObjectModification ): BucketModifyOperation {
	return { o: 'M', id: id, ccid: uuid(), v: patch };
}

/**
 * Creates a bucket change for the given bucket object id. The ghost is used to produce
 * the necessary change operations for simperium.
 *
 * @param { string } type - bucket change type, '-' to delete the object, 'M' to modify
 * @param { string } id - the bucket object id for the object to modify
 * @param { object } object - the properties the object will be updated to
 * @param { {version: number, data: {}} } ghost - the version and properties that are present on simperium
 * @returns { object } the bucket operation that produces the modifications to the object on simperium
 */
function buildChange( type: BucketChangeType, id: string, object: {}, ghost: { version: number, data: {} } ) {
	// Remove operations have no source version or diff
	if ( type === '-' ) return {
		o: '-',
		id: id,
		ccid: uuid()
	};

	const change: BucketModifyOperation = {
		o: 'M',
		id: id,
		ccid: uuid(),
		v: object_diff( ghost.data, object )
	}
	if ( ghost.version > 0 ) change.sv = ghost.version;

	return change;
}

/**
 * Given a sequential list of changes to apply to an object, combine them
 * into a single change. In terms of git, think of it as a squash.
 *
 * @param { Array<{}> } changes - list of changes that apply to a given base
 * @param { object } origin - the base the changes apply to
 * @returns { ?object } the combined changes. If any changes delete the object the result is null
 */
function compressChanges( changes: BucketOperation[], origin: {} ): ?BucketObjectModification {

	if ( changes.length === 0 ) {
		return {};
	}

	if ( changes.length === 1 ) {
		const change = changes[0];
		if ( change.o === 'M' ) {
			return change.v;
		}
		return null;
	}

	const modified = changes.reduce( ( from, change ) => {
		// deletes when, any changes after a delete are ignored
		if ( from === null ) return null;
		if ( change.o === '-' ) return null;
		return apply_object_diff( from, change.v );
	}, origin );

	if ( modified === null ) return null;

	return object_diff( origin, modified );
}

/**
 * Rebases the set of local modifications on top of upstream changes and returns
 * the object that results from those changes.
 *
 * @param { object } modifications - the modifications that apply to the base
 * @param { object } upstream - the upsteram modifications that apply to the base
 * @param { object } base - the object where the changes diverge
 * @returns { object } the object that results from rebasing modifications on top of upstream changes
 */
function rebase( modifications: BucketObjectModification, upstream: BucketObjectModification, base: {} ) {
	return transform_object_diff( modifications, upstream, base );
}

/**
 * Applies the modifications to the base object and returns the changed object.
 *
 * @param { object } modifications - the set of modifications to apply to base
 * @param { object } base - the object to be modified
 * @returns { object } the object that results from applying the modifications
 */
function apply_diff( modifications: BucketObjectModification, base: {} ) {
	return apply_object_diff( base, modifications );
}
