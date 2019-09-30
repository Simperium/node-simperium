/**
 * @flow
 */
import { change } from './';
import type { BucketOperation, BucketModifyOperation, Data, Ghost } from './change';

export type Operation =
 | {| type: 'modify', id: string, object: Data |}
 | {| type: 'remove', id: string |}
 | {| type: 'full', id: string, originalChange: BucketModifyOperation, object: Data |}

//  var payload = change_util.buildChange( change_util.type.MODIFY, id, object, ghost ),

export default function buildChange( operation: Operation, ghost: Ghost ): BucketOperation {
	switch ( operation.type ) {
		case 'modify': {
			return change.buildChange( 'M', operation.id, operation.object, ghost );
		}
		case 'remove': {
			return change.buildChange( '-', operation.id, {}, ghost );
		}
		case 'full': {
			return { ...operation.originalChange, d: operation.object };
		}
		default: {
			( operation.type: empty );
			throw new Error( 'Unknown operation type ' + JSON.stringify( operation ) );
		}
	}
}
