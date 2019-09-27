import Client from './client';
import Bucket from './bucket';
import Auth from './auth';
import * as util from './util';

/**
 * A Client is the main interface to Simperium.
 *
 * @param {String} appId - Simperium application id
 * @param {String} token - User access token
 * @param {Object} options - configuration options for the client
 * @param {ghostStoreProvider} [options.ghostStoreProvider=defaultGhostStoreProvider]
 *            - factory function for creating ghost store instances
 * @param {bucketStoreProvider} [options.objectStoreProvider=defaultObjectStoreProvider]
 *            - factory function for creating object store instances
 * @param {number} [options.heartbeatInterval=4] - heartbeat interval for maintaining connection status with Simperium.com
 * @param {websocketClientProvider} [options.websocketClientProvider] - WebSocket transport, if not provided tries to use window.WebSocket
 * @returns {Object} Simperium client.
 */
export default function createClient( appId, token, options ) {
	// Attaching an noop error listener. The behavior is to not
	// throw any runtime errors. This is something worth changing
	// but applications should be made aware when that is the case.
	return new Client( appId, token, options ).on( 'error', () => {} );
}

export { Auth, Client, Bucket, util };
