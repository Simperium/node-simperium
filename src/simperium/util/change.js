import uuid from 'node-uuid'
import jsondiff from '../jsondiff'

/**
 * @typedef {object} Change
 * @property {string} id id of changed Entity
 * @property {string} o type of Entity change - see below operation types
 * @property {object} v jsondiff object for each property
 * @property {string} ccid client-generated unique id for changeset
 */

/**
 * @typedef {object} Changeset
 * @property {string} id id of Entity being changed
 * @property {Array<Change>} ccids sequence of changes contained in changeset
 */

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

/**
 * Combine a sequence of changes into a single change object
 *
 * We will take a simple approach by starting with the base Entity
 * and apply each transformation to it in succession.
 * At the end of the iteration we'll take a final diff against
 * how that Entity started and that will equal the combined change.
 *
 * @TODO: Could we more easily rebase the changes without the base Entity?
 *
 * @param {Array<Change>} changes to apply in order
 * @param {object} baseEntity start Entity which changes modify
 * @returns {?Change} change representing all of the combined input changes
 */
function compressChanges( changes, baseEntity ) {
	// no changes is an empty changeset - don't do anything
	if ( changes.length === 0 ) {
		return {};
	}

	// if we only have a single change, that's it!
	if ( changes.length === 1 ) {
		return changes[0].v;
	}

	/**
	 * Otherwise we need to iterate
	 *
	 * At the first point in time where we remove the Entity
	 * we will want to short-circuit the rest of the changes.
	 *
	 * @type {?Object} the Entity as it's transformed
	 */
	const finalEntity = changes.reduce( ( combined, change ) =>
		( null !== combined && changeTypes.REMOVE !== combined.o )
			? apply_object_diff( combined, change.v )
			: null,
		baseEntity
	);

	// null indicates that the Entity should be removed
	return finalEntity !== null
		? object_diff( baseEntity, finalEntity )
		: null;
}

function rebase( local_diff, remote_diff, origin ) {
	return transform_object_diff( local_diff, remote_diff, origin );
}

function apply_diff( patch, object ) {
	return apply_object_diff( object, patch );
}
