// @flow
/**
 * External dependencies
 */
import { equal, deepEqual } from 'assert';
import { createStore } from 'redux';
import { view, lensPath } from 'ramda';
/**
 * Internal dependencies
 */
import { BUCKET_OBJECT_SAVE } from '../src/store/types';
import { saveBucketObject, removeBucketObject, saveGhost, removeGhost } from '../src/store/actions';
import reducer from '../src/store/reducer';

describe( 'reducer', () => {
	it( 'should save object', () => {
		const object = { title: 'Title of thing' };
		const { dispatch, getState } = createStore( reducer );
		const result = dispatch( saveBucketObject( 'bucket', 'object-id', object ) );

		equal( result.type, BUCKET_OBJECT_SAVE );
		deepEqual(
			view( lensPath( [ 'buckets', 'bucket', 'object-id' ] ), getState() ),
			object
		);
	} );

	it( 'should remove object', () => {
		const object = { title: 'Title of thing' };
		const { dispatch, getState } = createStore( reducer, { buckets: { bucket: { key: object } } } );

		dispatch( removeBucketObject( 'bucket', 'key' ) );
		deepEqual(
			view( lensPath( [ 'buckets', 'bucket' ] ), getState() ),
			{}
		);
	} );

	it( 'should save ghost', () => {
		const object = { title: 'title of thing' };
		const { dispatch, getState } = createStore( reducer );
		dispatch( saveGhost( 'bucket', 'key', 1, object ) );

		deepEqual(
			view( lensPath( [ 'ghosts', 'bucket', 'key' ] ), getState() ),
			{ v: 1, o: object }
		);
	} );

	it( 'should remove ghost', () => {
		const object = { title: 'title of thing' };
		const { dispatch, getState } = createStore( reducer, { ghosts: { bucket: { key: object } } } );

		dispatch( removeGhost( 'bucket', 'key' ) );
		deepEqual(
			view( lensPath( [ 'ghosts', 'bucket' ] ), getState() ),
			{}
		);
	} );
} );
