//@flow
/**
 * External dependencies
 */

/**
 * Internal dependencies
 */
import {
	BUCKET_OBJECT_SAVE,
	BUCKET_OBJECT_REMOVE,
	GHOST_SAVE,
	GHOST_REMOVE,
} from './types';

export type ReduxAction = { type: string };
export type SaveBucketObjectAction = { type: string, bucket: string, key: string, object: Object }
export type RemoveBucketObjectAction = { type: string, bucket: string, key: string }
export type SaveGhostAction = { type: string, bucket: string, key: string, version: number, object: Object };
export type RemoveGhostAction = { type: string, bucket: string, key: string };

export const saveBucketObject = ( bucket: string, key: string, object: Object ): SaveBucketObjectAction => ( {
	type: BUCKET_OBJECT_SAVE, key, object, bucket
} );

export const removeBucketObject = ( bucket: string, key: string ): RemoveBucketObjectAction => ( {
	type: BUCKET_OBJECT_REMOVE, key, bucket
} );

export const saveGhost = ( bucket: string, key: string, version: number, object: Object ): SaveGhostAction => ( {
	type: GHOST_SAVE, bucket, key, version, object
} );

export const removeGhost = ( bucket: string, key: string ): RemoveGhostAction => ( {
	type: GHOST_REMOVE, bucket, key
} );
