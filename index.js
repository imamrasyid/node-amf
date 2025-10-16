
var constants = require('./lib/constants');
exports.amf0Types = constants.amf0Types;
exports.amf3Types = constants.amf3Types;

exports.read = require('./lib/read');
exports.write = require('./lib/write');

// Helper functions for AMF3 support
exports.createAmf3Object = function(obj, className) {
  obj = obj || {};
  obj.__amf3__ = true;
  if (className) {
    obj.__className__ = className;
  }
  return obj;
};

exports.createAmf3XML = function(xmlString, isDocument) {
  return {
    __amf3__: true,
    __type__: isDocument ? 'XMLDocument' : 'XML',
    toString: function() { return xmlString; }
  };
};

exports.createAmf3ByteArray = function(buffer) {
  buffer.__amf3__ = true;
  return buffer;
};
