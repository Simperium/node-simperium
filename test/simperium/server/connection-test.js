import Connection from 'simperium/server/connection'
import assert from 'assert'
import MockBucket from './mock-bucket'

describe( 'Server Connection', () => {
	var connection;

	beforeEach( () => {
		connection = new Connection()
		connection.authorizer = ( params, cb ) => {
			cb( null, 'test@example.com', new MockBucket() )
		}
	} )

	it( 'should respond to heartbeats', ( done ) => {
		connection.on( 'send', ( msg ) => {
			assert.equal( msg, 'h:2' )
			done()
		} )
		connection.receive( 'h:1' )
	} )

	it( 'should open a new channel', ( done ) => {
		connection.on( 'openchannel', ( id, channel ) => {
			assert.equal( id, 0 )
			assert( channel )
			done()
		} )
		connection.receive( '0:init:{}' )
	} )

	it( 'should send channel messages', ( done ) => {
		connection.on( 'send', ( msg ) => {
			assert.equal( msg, '0:auth:test@example.com' )
			done()
		} )
		connection.receive( '0:init:{}' )
	} )
} )
