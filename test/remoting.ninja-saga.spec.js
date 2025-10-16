var assert = require('assert');
var amf = require('..');

var remoting = amf.remoting;

function createLoginRequest () {
  var payload = amf.createAmf3Object({
    accountId: 'player-12345',
    sessionKey: 'rasengan-token',
    build: 'ninja-saga/1.0.0'
  }, 'com.ninjasaga.protocol.LoginRequest');

  return {
    version: 0,
    headers: [
      {
        name: 'DSId',
        mustUnderstand: false,
        value: 'nil'
      },
      {
        name: 'DSEndpoint',
        mustUnderstand: false,
        value: 'ninja-gateway'
      }
    ],
    messages: [
      {
        targetUri: 'PlayerService.login',
        responseUri: '/1',
        body: amf.createAmf3Object({
          cmd: 'login',
          args: [payload]
        }, 'com.ninjasaga.protocol.CommandEnvelope')
      }
    ]
  };
}

describe('AMF Remoting - Ninja Saga workflow', function () {
  it('encodes envelope compatible with Ninja Saga gateway', function () {
    var packet = createLoginRequest();
    var buffer = remoting.encodePacket(packet, { size: 2048 });
    assert(buffer.length > 0);

    var decoded = remoting.decodePacket(buffer);

    assert.strictEqual(decoded.version, 0);
    assert.strictEqual(decoded.headers.length, 2);
    assert.strictEqual(decoded.messages.length, 1);
    assert.strictEqual(decoded.headers[0].name, 'DSId');
    assert.strictEqual(decoded.headers[1].name, 'DSEndpoint');
    assert.strictEqual(decoded.messages[0].targetUri, 'PlayerService.login');
    assert.strictEqual(decoded.messages[0].objectEncoding, 3);
    assert.strictEqual(decoded.messages[0].body.__className__, 'com.ninjasaga.protocol.CommandEnvelope');
    assert.strictEqual(decoded.messages[0].body.cmd, 'login');
    assert.strictEqual(decoded.messages[0].body.args.length, 1);
    assert.strictEqual(decoded.messages[0].body.args[0].__className__, 'com.ninjasaga.protocol.LoginRequest');
    assert.strictEqual(decoded.messages[0].body.args[0].accountId, 'player-12345');
    assert.strictEqual(decoded.messages[0].body.args[0].sessionKey, 'rasengan-token');
  });

  it('tracks byteLength for slicing network frames', function () {
    var packet = createLoginRequest();
    var buffer = Buffer.alloc(4096);
    var encoded = remoting.encodePacket(packet, { buffer: buffer });
    var decoded = remoting.decodePacket(encoded);

    assert.strictEqual(decoded.byteLength, encoded.length);
  });
});
