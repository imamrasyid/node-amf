node-amf
========
### "[Action Message Format][AMF]" read() and write() functions for Buffers
[![Build Status](https://travis-ci.org/TooTallNate/node-amf.svg?branch=master)](https://travis-ci.org/TooTallNate/node-amf)

This module reads and writes AMF ([Action Message Format][AMF], commonly used
with Adobe products) data types to/from node.js `Buffer` instances.

For example, the [FLV][node-flv] container format by Adobe encodes its "metadata"
packets with AMF data. This module can decode those packets back into JavaScript
values.

Installation
------------

Install through npm:

``` bash
$ npm install amf
```


Example
-------

Here's an example of reading an ECMA Object from a Buffer:

``` javascript
var amf = require('amf');

// this is an AMF-encoded Object...
var data = new Buffer('03 00 03 66 6f 6f 02 00 03 62 61 72 00 00 09'.replace(/ /g, ''), 'hex');

// read the Object out from the Buffer
var obj = amf.read(data, 0);

console.log(obj);
// { foo: 'bar' }
```


API
---

### `amf.remoting`

Ninja Saga and many other Flash-era services speak AMF Remoting packets, which
wrap the individual AMF payloads in an envelope that describes headers and
messages. The new `amf.remoting` helper makes it easy to work directly with
those packets.

```js
const amf = require('amf');

// Decode a binary Ninja Saga gateway response
const packet = amf.remoting.decodePacket(buffer);
console.log(packet.messages[0].body);

// Create a login request
const body = amf.createAmf3Object({
  cmd: 'login',
  args: [amf.createAmf3Object({
    accountId: 'player-12345',
    sessionKey: 'rasengan-token'
  }, 'com.ninjasaga.protocol.LoginRequest')]
}, 'com.ninjasaga.protocol.CommandEnvelope');

const request = amf.remoting.encodePacket({
  version: 0,
  headers: [
    { name: 'DSId', value: 'nil' },
    { name: 'DSEndpoint', value: 'ninja-gateway' }
  ],
  messages: [
    { targetUri: 'PlayerService.login', responseUri: '/1', body: body }
  ]
});
```

`decodePacket()` returns the AMF object for each header and message and exposes
which encoding (AMF0 or AMF3) was used. `encodePacket()` applies the same
behaviour as the low level writer, automatically switching to AMF3 whenever the
payload has the `__amf3__` marker. This allows you to craft Ninja Saga requests
and parse responses without manually handling the envelope structure.

[AMF]: http://en.wikipedia.org/wiki/Action_Message_Format
[node-flv]: https://github.com/TooTallNate/node-flv
