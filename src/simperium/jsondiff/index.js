// @flow
import JSONDiff from './jsondiff'
import diff_match_patch from './diff_match_patch'
import type { ObjectOperationSet } from './jsondiff';

export type { ObjectOperationSet };

export { JSONDiff as jsondiff, diff_match_patch }

export default function init( options: ?{ list_diff: boolean } ): JSONDiff {
	return new JSONDiff( options );
}
