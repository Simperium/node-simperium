var Channel = require('../../lib/simperium/channel');
var EventEmitter = require('events').EventEmitter;
var util = require('util');
var parseMessage = require('../../lib/simperium/util').parseMessage;
var assert = require('assert');

describe('Channel', function(){

  it('should send init on connect', function(done){
    var channel = makeChannel(),
        client = channel.client;

    channel.on('send', function(data){
      var message = parseMessage(data),
          payload = JSON.parse(message.data);

      assert.equal('init', message.command);
      assert.equal('mock-token', payload.token);
      assert.equal(1, payload.api);
      assert.equal('mock-app-id', payload.app_id);
      assert.equal('node-simperium', payload.library);
      assert.equal(0, payload.version);
      done();
    });

    client.emit('connect');

  });

});

function makeChannel(id, bucketName, accessToken){

  if (!bucketName) bucketName = 'things';
  if (!accessToken) accessToken = 'mock-token';

  var client = new EventEmitter();
      channel = new Channel(client, bucketName, accessToken);

  client.appId = 'mock-app-id';

  return channel;

}
