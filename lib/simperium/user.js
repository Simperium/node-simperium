export default function User( options ) {
	this.options = options;
	this.access_token = options.access_token;
}

User.fromJSON = function( json ) {
	var data = JSON.parse( json );
	return new User( data );
}
