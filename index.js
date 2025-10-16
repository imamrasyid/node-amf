
var constants = require('./lib/constants');
exports.amf0Types = constants.amf0Types;
exports.amf3Types = constants.amf3Types;

exports.read = require('./lib/read');
exports.write = require('./lib/write');
exports.remoting = require('./lib/remoting');

// High-level helpers with auto-detect (AMF0/AMF3)
exports.decode = function decode(buffer, options) {
  options = options || {};
  var read = exports.read;
  var info = { offset: 0 };
  if (options.objectEncoding === 0 || options.objectEncoding === 3) {
    info.version = options.objectEncoding;
  } else {
    // auto-detect: peek first byte; if AMF0 with AVMPlus (0x11), delegate inside read
    info.version = 0;
  }
  return read(buffer, info);
};

exports.encode = function encode(value, options) {
  options = options || {};
  var write = exports.write;
  var info = { offset: 0 };
  var version = 0;
  if (options.objectEncoding === 3) version = 3;
  if (options.objectEncoding === 0) version = 0;
  info.version = version;
  // conservative preallocation; caller may pass a buffer
  var buf = options.buffer || Buffer.alloc(options.size || 1024 * 1024);
  write(buf, value, info);
  return buf.slice(0, info.offset);
};

// Helper functions for AMF3 support
exports.createAmf3Object = function (obj, className) {
  obj = obj || {};
  obj.__amf3__ = true;
  if (className) {
    obj.__className__ = className;
  }
  return obj;
};

exports.createAmf3XML = function (xmlString, isDocument) {
  return {
    __amf3__: true,
    __type__: isDocument ? 'XMLDocument' : 'XML',
    toString: function () { return xmlString; }
  };
};

exports.createAmf3ByteArray = function (buffer) {
  buffer.__amf3__ = true;
  return buffer;
};
