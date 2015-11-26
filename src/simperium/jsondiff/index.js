import JSONDiff from './jsondiff'
import diff_match_patch from './diff_match_patch'

export { JSONDiff as jsondiff, diff_match_patch }

export default function init( options ) {
	return new JSONDiff( options );
}
