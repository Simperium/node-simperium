// @flow
import { JSONDiff } from './jsondiff'
import type { ObjectOperationSet } from './jsondiff';

export type { ObjectOperationSet }

const jsondiff = new JSONDiff( { list_diff: false } );

export { jsondiff as default };
