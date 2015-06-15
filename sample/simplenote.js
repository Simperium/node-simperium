var Client = require('../lib/simperium/client');
var Auth = require('../lib/simperium/auth');

var client = new Client(process.env.SIMPERIUM_APP_ID);
var auth = new Auth(process.env.SIMPERIUM_APP_ID, process.env.SIMPERIUM_APP_SECRET)

client.connect();

auth.on('authorize', function(user){

  var notes = client.bucket('note', user.access_token),
      tags = client.bucket('tag', user.access_token);

  notes.on('index', function(){

    var now = (new Date()).getTime(),
        note = {
          content: "Hola mundo!",
          systemTags:[],
          tags:[],
          creationDate:now,
          modificationDate:now,
          publishURL:"",
          shareURL:"",
          deleted: false
        };

    notes.add(note, function(err, id, object) {
      // if (err) throw err;
      setTimeout(function(){
        console.log('update!', id);
        note.content += "\n\nEl Fin";
        notes.update(id, note);
      }, 2000);
    });

  });

});

auth.authorize(
  process.env.SIMPLENOTE_USERNAME,
  process.env.SIMPLENOTE_PASSWORD
).then(function(user){
  console.log("Logged in", user);
}, function(error) {
  console.error("Failed to authenticate", error);
  client.end();
});

client.on('send', function(data) {
  console.warn(" => ", data.slice(0, 200));
});

client.on('message', function(message) {
  console.warn(" <= ", message.slice(0, 80));
});

client.on('reconnect', function(attempt){
  console.warn("Attempting reconnection", attempt);
});