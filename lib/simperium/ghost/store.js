

export default function Store(bucket){
  this.bucket = bucket;
  this.index = {};
}

Store.prototype.getChangeVersion = function(){
  var self = this,
      promise = new Promise(function(resolve, reject) {
        setImmediate(function() {
          resolve(self.cv);
        });
      });

	return promise;
};

Store.prototype.setChangeVersion = function(cv){
  var self = this,
      promise = new Promise(function(resolve, reject) {
        setImmediate(function() {
          self.cv = cv;
          resolve(cv);
        });
      });

	return promise;
};

Store.prototype.put = function(id, version, data){
  var self = this,
      promise = new Promise(function(resolve, reject) {
        setImmediate(function(){
          self.index[id] = JSON.stringify({version:version, data:data});
          resolve(true);
        });
      });
	return promise;
};

Store.prototype.get = function( id ){
	var index = this.index;
	return new Promise( function ( resolve, reject ) {
		setImmediate( function () {
		  var ghost = index[id];
		  if (!ghost){
		    ghost = {data:{}};
		    index[id] = JSON.stringify( ghost );
		  } else {
		    ghost = JSON.parse( ghost );
		  }
		  resolve( ghost );
		} );
	} );
};

Store.prototype.remove = function( id ) {
	var index = this.index;
  return new Promise( function ( resolve, reject ) {
    setImmediate( function() {
      delete index[id];
      resolve();
    } );
  } );
};
