'use strict';

var read = require('./read');
var write = require('./write');

/**
 * Decode an AMF Remoting packet (AMF0 envelope with AMF0/AMF3 bodies).
 * Commonly used by games such as Ninja Saga.
 *
 * @param {Buffer} buffer
 * @param {Object} [options]
 * @return {Object}
 */
exports.decodePacket = function decodePacket (buffer, options) {
  options = options || {};
  var offset = options.offset || 0;
  var version = buffer.readUInt16BE(offset);
  offset += 2;

  var headerCount = buffer.readUInt16BE(offset);
  offset += 2;
  var headers = [];

  for (var i = 0; i < headerCount; i++) {
    var headerName = readUtf8(buffer, offset);
    offset = headerName.offset;
    var mustUnderstand = buffer.readUInt8(offset) === 1;
    offset += 1;
    var contentLength = buffer.readInt32BE(offset);
    offset += 4;

    var valueOffset = offset;
    var info = { offset: valueOffset, version: 0 };
    var value = read(buffer, info);
    var consumed = info.offset - valueOffset;

    if (contentLength >= 0) {
      offset = valueOffset + contentLength;
    } else {
      offset = valueOffset + consumed;
    }

    headers.push({
      name: headerName.value,
      mustUnderstand: mustUnderstand,
      value: value,
      length: contentLength,
      objectEncoding: info.version || 0
    });
  }

  var messageCount = buffer.readUInt16BE(offset);
  offset += 2;
  var messages = [];

  for (var j = 0; j < messageCount; j++) {
    var targetUri = readUtf8(buffer, offset);
    offset = targetUri.offset;
    var responseUri = readUtf8(buffer, offset);
    offset = responseUri.offset;
    var bodyLength = buffer.readInt32BE(offset);
    offset += 4;

    var bodyOffset = offset;
    var bodyInfo = { offset: bodyOffset, version: 0 };
    var body = read(buffer, bodyInfo);
    var bodyConsumed = bodyInfo.offset - bodyOffset;

    if (bodyLength >= 0) {
      offset = bodyOffset + bodyLength;
    } else {
      offset = bodyOffset + bodyConsumed;
    }

    messages.push({
      targetUri: targetUri.value,
      responseUri: responseUri.value,
      body: body,
      length: bodyLength,
      objectEncoding: bodyInfo.version || 0
    });
  }

  return {
    version: version,
    headers: headers,
    messages: messages,
    byteLength: offset - (options.offset || 0)
  };
};

/**
 * Encode an AMF Remoting packet. The default envelope uses AMF0, with bodies
 * optionally switching to AMF3 when the payload object has the `__amf3__`
 * marker (the same convention used by the core encoder).
 *
 * @param {Object} packet
 * @param {Object} [options]
 * @return {Buffer}
 */
exports.encodePacket = function encodePacket (packet, options) {
  options = options || {};
  var headers = packet.headers || [];
  var messages = packet.messages || [];
  var buffer = options.buffer || Buffer.alloc(options.size || 1024 * 1024);
  var offset = options.offset || 0;

  buffer.writeUInt16BE(packet.version || 0, offset);
  offset += 2;

  buffer.writeUInt16BE(headers.length, offset);
  offset += 2;

  for (var i = 0; i < headers.length; i++) {
    var header = headers[i];
    offset = writeUtf8(buffer, offset, header.name || '');
    buffer.writeUInt8(header.mustUnderstand ? 1 : 0, offset);
    offset += 1;

    var headerBuffer = encodeValue(header.value, header.objectEncoding, options.sectionSize);
    buffer.writeInt32BE(headerBuffer.length, offset);
    offset += 4;
    headerBuffer.copy(buffer, offset);
    offset += headerBuffer.length;
  }

  buffer.writeUInt16BE(messages.length, offset);
  offset += 2;

  for (var j = 0; j < messages.length; j++) {
    var message = messages[j];
    offset = writeUtf8(buffer, offset, message.targetUri || '');
    offset = writeUtf8(buffer, offset, message.responseUri || '');

    var messageBuffer = encodeValue(message.body, message.objectEncoding, options.sectionSize);
    buffer.writeInt32BE(messageBuffer.length, offset);
    offset += 4;
    messageBuffer.copy(buffer, offset);
    offset += messageBuffer.length;
  }

  return buffer.slice(options.offset || 0, offset);
};

function readUtf8 (buffer, offset) {
  var length = buffer.readUInt16BE(offset);
  offset += 2;
  var value = buffer.toString('utf8', offset, offset + length);
  offset += length;
  return { value: value, offset: offset };
}

function writeUtf8 (buffer, offset, value) {
  var str = value || '';
  var byteLength = Buffer.byteLength(str, 'utf8');
  if (byteLength > 0xFFFF) {
    throw new RangeError('String too long for AMF0 UTF-8: ' + byteLength + ' bytes');
  }
  buffer.writeUInt16BE(byteLength, offset);
  offset += 2;
  buffer.write(str, offset, byteLength, 'utf8');
  return offset + byteLength;
}

function encodeValue (value, objectEncoding, sectionSize) {
  var version = objectEncoding === 3 ? 3 : 0;
  var size = sectionSize || 128 * 1024;

  while (true) {
    var buf = Buffer.alloc(size);
    var info = { offset: 0, version: version };
    try {
      write(buf, value, info);
      return buf.slice(0, info.offset);
    } catch (err) {
      if (err && /out of range/i.test(err.message) && size < 16 * 1024 * 1024) {
        size *= 2;
        continue;
      }
      throw err;
    }
  }
}
