/**
 * External dependencies
 */
import { createStore as createReduxStore } from 'redux';
/**
 * Internal dependencies
 */
import reducer from './reducer';

export const createStore = () => {
	return createReduxStore( reducer );
};
