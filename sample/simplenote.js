var Client = require('./lib/simperium/client');

var client = new Client(process.env.SIMPERIUM_APP_ID, process.env.SIMPERIUM_APP_SECRET);

client.connect();

client.users.on('authorize', function(user){

  var notes = client.bucket('note', user)
    , tags = client.bucket('tag', user);


  notes.on('index', function(){

    var now = (new Date).getTime()
      , note = {
        content: "Hola mundo!"
      , systemTags:[]
      , tags:[]
      , creationDate:now
      , modificationDate:now
      , publishURL:""
      , shareURL:""
      , deleted: false
      , };

    var id = notes.add(note);

    setTimeout(function(){
      console.log('update!');
      note.content += "\n\nEl Fin";
      notes.update(id, note)
    }, 2000);

  })

});

client.users.authorize(
  process.env.SIMPLENOTE_USERNAME,
  process.env.SIMPLENOTE_PASSWORD
);
