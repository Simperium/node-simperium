// @flow
import Store from './store'

/**
 * In memory implementation of a ghostStoreProvider
 *
 * @param {Bucket} a bucket instance to store ghost objects for
 * @returns {GhostStore} an istance of a GhostStore used to save Ghost data
 */
export default function( bucket: Bucket ) {
	return new Store( bucket );
};
