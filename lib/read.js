
/**
 * Module dependencies.
 */

var assert = require('assert');
var constants = require('./constants');
var amf0Types = constants.amf0Types;
var amf3Types = constants.amf3Types;

/**
 * Module exports.
 */

module.exports = read;

/**
 * Reads an AMF object from the specified Buffer at the specified offset.
 *
 * @param {Buffer} buffer The Buffer instance to read from.
 * @param {Object|Number} info "Options" object, or the byte offset to begin reading from.
 * @return {Object|Array} The decoded AMF object.
 * @api public
 */

function read (buffer, info) {
  if ('number' == typeof info) info = { offset: info };
  if (!info) info = {};
  if (null == info.offset) info.offset = 0;
  if (null == info.version) info.version = 0; // Default to AMF0

  // gets reset to 0 on each `read()` call
  info.byteLength = 0;

  // read the "type" byte
  var type = buffer.readUInt8(info.offset);
  bytesUsed(info, 1);

  // Check for AMF3 marker in AMF0 mode
  if (info.version === 0 && type === amf0Types.kAvmPlusObjectType) {
    info.version = 3;
    return readAmf3(buffer, info);
  }

  if (info.version === 0) {
    // AMF0 parsing
    switch (type) {
      case amf0Types.kNumberType:
        return readNumber(buffer, info);
      case amf0Types.kBooleanType:
        return readBoolean(buffer, info);
      case amf0Types.kStringType:
        return readString(buffer, info);
      case amf0Types.kObjectType:
        return readObject(buffer, info);
      case amf0Types.kNullType:
        return null;
      case amf0Types.kUndefinedType:
        return undefined;
      case amf0Types.kReferenceType:
        return readReference(buffer, info);
      case amf0Types.kECMAArrayType:
        return readECMAArray(buffer, info);
      case amf0Types.kObjectEndType:
        return END_OBJECT;
      case amf0Types.kStrictArrayType:
        return readStrictArray(buffer, info);
      case amf0Types.kDateType:
        return readDate(buffer, info);
      case amf0Types.kTypedObjectType:
        return readTypedObject(buffer, info);
      default:
        throw new Error('AMF0 type not yet implemented: ' + type);
    }
  } else {
    // AMF3 parsing
    return readAmf3(buffer, info, type);
  }
}

function bytesUsed (info, n) {
  info.offset += n;
  info.byteLength += n;
}

// 2.2 Number Type

function readNumber (buffer, info) {
  var offset = info.offset;
  bytesUsed(info, 8);
  return buffer.readDoubleBE(offset);
}

// 2.3 Boolean Type

function readBoolean (buffer, info) {
  var offset = info.offset;
  bytesUsed(info, 1);
  return buffer.readUInt8(offset) !== 0;
}

// 2.4 String Type

function readString (buffer, info) {
  var offset = info.offset;

  var length = buffer.readUInt16BE(offset);
  bytesUsed(info, 2);

  offset = info.offset;
  bytesUsed(info, length);
  return buffer.toString('utf8', offset, offset + length);
}

// 2.5 Object Type

function readObject (buffer, info, object) {
  var key, value;
  if (!object) object = {};

  if (!info.references) info.references = [];
  info.references.push(object);

  var temp = {};
  while (value !== END_OBJECT) {
    temp.offset = info.offset;
    temp.byteLength = 0;
    key = readString(buffer, temp);
    bytesUsed(info, temp.byteLength);

    temp.offset = info.offset;
    temp.references = info.references;
    value = read(buffer, temp);
    bytesUsed(info, temp.byteLength);

    if (value !== END_OBJECT) object[key] = value;
  }
  assert.strictEqual(key, '');
  assert.strictEqual(value, END_OBJECT);

  return object;
}

// 2.6 Movieclip Type
// This type is not supported and is reserved for future use.

// 2.7 null Type

// 2.8 undefined Type

// 2.9 Reference Type

function readReference (buffer, info) {
  var index = buffer.readUInt16BE(info.offset);
  bytesUsed(info, 2);
  return info.references[index];
}

// 2.10 ECMA Array Type

function readECMAArray (buffer, info, array) {
  if (!Array.isArray(array)) array = [];

  // ignored, and can't really be relied on since ECMA arrays can have numbered
  // indices, and/or names keys which may or may not be counted here
  var count = buffer.readUInt32BE(info.offset);
  bytesUsed(info, 4);

  // at this point it's the same binary structure as a regular Object
  readObject(buffer, info, array);

  return array;
}

// 2.11 Object End Type

// sentinel object that signifies the "end" of an ECMA Object/Array
var END_OBJECT = { endObject: true };

// 2.12 Strict Array Type

function readStrictArray (buffer, info, array) {
  var value, temp;
  if (!Array.isArray(array)) array = [];

  if (!info.references) info.references = [];
  info.references.push(array);

  var count = buffer.readUInt32BE(info.offset);
  bytesUsed(info, 4);

  temp = {};
  for (var i = 0; i < count; i++) {
    temp.offset = info.offset;
    temp.references = info.references;
    value = read(buffer, temp);
    bytesUsed(info, temp.byteLength);
    array.push(value);
  }

  return array;
}

// 2.13 Date Type

function readDate (buffer, info) {
  // number of milliseconds elapsed since the epoch
  // of midnight on 1st Jan 1970 in the UTC time zone
  var millis = buffer.readDoubleBE(info.offset);
  bytesUsed(info, 8);

  // reserved, not supported SHOULD be set to 0x0000 (not enforced)
  var timezone = buffer.readInt16BE(info.offset);
  bytesUsed(info, 2);

  return new Date(millis);
}

// 2.14 Long String Type
// 2.15 Unsupported Type

// 2.16 RecordSet Type
// This type is not supported and is reserved for future use.

// 2.17 XML Document Type

// 2.18 Typed Object Type

function readTypedObject (buffer, info) {
  // "typed" objects are just regular ECMA Objects with a String class name at the
  // beginning
  var name = readString(buffer, info);
  var obj = readObject(buffer, info);
  obj.__className__ = name;
  return obj;
}

/**
 * AMF3 implementation
 */

function readAmf3 (buffer, info, type) {
  if (type === undefined) {
    // If type is not provided, read it from the buffer
    type = buffer.readUInt8(info.offset);
    bytesUsed(info, 1);
  }

  // Initialize AMF3 references if not already done
  if (!info.amf3StringReferences) info.amf3StringReferences = [];
  if (!info.amf3ObjectReferences) info.amf3ObjectReferences = [];
  if (!info.amf3TraitReferences) info.amf3TraitReferences = [];

  switch (type) {
    case amf3Types.kUndefinedType:
      return undefined;
    case amf3Types.kNullType:
      return null;
    case amf3Types.kFalseType:
      return false;
    case amf3Types.kTrueType:
      return true;
    case amf3Types.kIntegerType:
      return readAmf3Integer(buffer, info);
    case amf3Types.kDoubleType:
      return readAmf3Double(buffer, info);
    case amf3Types.kStringType:
      return readAmf3String(buffer, info);
    case amf3Types.kXMLType:
      return readAmf3XML(buffer, info, false);
    case amf3Types.kDateType:
      return readAmf3Date(buffer, info);
    case amf3Types.kArrayType:
      return readAmf3Array(buffer, info);
    case amf3Types.kObjectType:
      return readAmf3Object(buffer, info);
    case amf3Types.kAvmPlusXmlType:
      return readAmf3XML(buffer, info, true);
    case amf3Types.kByteArrayType:
      return readAmf3ByteArray(buffer, info);
    default:
      throw new Error('AMF3 type not yet implemented: ' + type);
  }
}

function readAmf3Integer (buffer, info) {
  var result = 0;
  var byte = buffer.readUInt8(info.offset);
  bytesUsed(info, 1);
  
  // Handle 1-4 byte integers with variable length encoding
  if (byte < 128) {
    return byte;
  }
  
  result = (byte & 0x7F) << 7;
  byte = buffer.readUInt8(info.offset);
  bytesUsed(info, 1);
  
  if (byte < 128) {
    return result | byte;
  }
  
  result = (result | (byte & 0x7F)) << 7;
  byte = buffer.readUInt8(info.offset);
  bytesUsed(info, 1);
  
  if (byte < 128) {
    return result | byte;
  }
  
  result = (result | (byte & 0x7F)) << 8;
  byte = buffer.readUInt8(info.offset);
  bytesUsed(info, 1);
  
  return result | byte;
}

function readAmf3Double (buffer, info) {
  var offset = info.offset;
  bytesUsed(info, 8);
  return buffer.readDoubleBE(offset);
}

function readAmf3String (buffer, info) {
  var header = readAmf3Integer(buffer, info);
  var isReference = (header & 1) === 0;
  
  if (isReference) {
    var refIndex = header >> 1;
    if (refIndex >= info.amf3StringReferences.length) {
      throw new Error('Invalid string reference: ' + refIndex);
    }
    return info.amf3StringReferences[refIndex];
  }
  
  var length = header >> 1;
  
  // Empty string
  if (length === 0) {
    return '';
  }
  
  var offset = info.offset;
  bytesUsed(info, length);
  var str = buffer.toString('utf8', offset, offset + length);
  
  // Add to reference table
  info.amf3StringReferences.push(str);
  
  return str;
}

function readAmf3Date (buffer, info) {
  var header = readAmf3Integer(buffer, info);
  var isReference = (header & 1) === 0;
  
  if (isReference) {
    var refIndex = header >> 1;
    if (refIndex >= info.amf3ObjectReferences.length) {
      throw new Error('Invalid date reference: ' + refIndex);
    }
    return info.amf3ObjectReferences[refIndex];
  }
  
  var offset = info.offset;
  bytesUsed(info, 8);
  var date = new Date(buffer.readDoubleBE(offset));
  
  // Add to reference table
  info.amf3ObjectReferences.push(date);
  
  return date;
}

function readAmf3Array (buffer, info) {
  var header = readAmf3Integer(buffer, info);
  var isReference = (header & 1) === 0;
  
  if (isReference) {
    var refIndex = header >> 1;
    if (refIndex >= info.amf3ObjectReferences.length) {
      throw new Error('Invalid array reference: ' + refIndex);
    }
    return info.amf3ObjectReferences[refIndex];
  }
  
  var length = header >> 1;
  var array = [];
  
  // Add to reference table before reading contents to handle circular references
  info.amf3ObjectReferences.push(array);
  
  // Read associative part (string keys)
  var key = readAmf3String(buffer, info);
  while (key !== '') {
    array[key] = readAmf3(buffer, info);
    key = readAmf3String(buffer, info);
  }
  
  // Read dense part (numeric indices)
  for (var i = 0; i < length; i++) {
    array.push(readAmf3(buffer, info));
  }
  
  return array;
}

function readAmf3Object (buffer, info) {
  var header = readAmf3Integer(buffer, info);
  var isReference = (header & 1) === 0;
  
  if (isReference) {
    var refIndex = header >> 1;
    if (refIndex >= info.amf3ObjectReferences.length) {
      throw new Error('Invalid object reference: ' + refIndex);
    }
    return info.amf3ObjectReferences[refIndex];
  }
  
  // Read traits
  var isTraitReference = ((header >> 1) & 1) === 0;
  var isExternalizable = ((header >> 2) & 1) === 1;
  var isDynamic = ((header >> 3) & 1) === 1;
  var traitCount = header >> 4;
  var className = '';
  var propertyNames = [];
  
  if (isTraitReference) {
    var traitRefIndex = header >> 2;
    if (traitRefIndex >= info.amf3TraitReferences.length) {
      throw new Error('Invalid trait reference: ' + traitRefIndex);
    }
    var trait = info.amf3TraitReferences[traitRefIndex];
    className = trait.className;
    propertyNames = trait.propertyNames;
    isExternalizable = trait.isExternalizable;
    isDynamic = trait.isDynamic;
  } else {
    className = readAmf3String(buffer, info);
    
    // Store trait info
    var trait = {
      className: className,
      propertyNames: [],
      isExternalizable: isExternalizable,
      isDynamic: isDynamic
    };
    
    // Read property names
    for (var i = 0; i < traitCount; i++) {
      var propName = readAmf3String(buffer, info);
      trait.propertyNames.push(propName);
      propertyNames.push(propName);
    }
    
    info.amf3TraitReferences.push(trait);
  }
  
  // Create object
  var object = {};
  if (className) {
    object.__className__ = className;
  }
  
  // Add to reference table before reading contents to handle circular references
  info.amf3ObjectReferences.push(object);
  
  // Handle externalizable objects
  if (isExternalizable) {
    // For externalizable objects, we can't decode them without custom logic
    // Just return the object with a flag indicating it's externalizable
    object.__externalizable__ = true;
    return object;
  }
  
  // Read sealed properties
  for (var i = 0; i < propertyNames.length; i++) {
    object[propertyNames[i]] = readAmf3(buffer, info);
  }
  
  // Read dynamic properties
  if (isDynamic) {
    var key = readAmf3String(buffer, info);
    while (key !== '') {
      object[key] = readAmf3(buffer, info);
      key = readAmf3String(buffer, info);
    }
  }
  
  return object;
}

function readAmf3XML (buffer, info, isAvmPlus) {
  var header = readAmf3Integer(buffer, info);
  var isReference = (header & 1) === 0;
  
  if (isReference) {
    var refIndex = header >> 1;
    if (refIndex >= info.amf3ObjectReferences.length) {
      throw new Error('Invalid XML reference: ' + refIndex);
    }
    return info.amf3ObjectReferences[refIndex];
  }
  
  var length = header >> 1;
  
  var offset = info.offset;
  bytesUsed(info, length);
  var xmlStr = buffer.toString('utf8', offset, offset + length);
  
  // Create XML object
  var xml = {
    __type__: isAvmPlus ? 'XMLDocument' : 'XML',
    toString: function() { return xmlStr; }
  };
  
  // Add to reference table
  info.amf3ObjectReferences.push(xml);
  
  return xml;
}

function readAmf3ByteArray (buffer, info) {
  var header = readAmf3Integer(buffer, info);
  var isReference = (header & 1) === 0;
  
  if (isReference) {
    var refIndex = header >> 1;
    if (refIndex >= info.amf3ObjectReferences.length) {
      throw new Error('Invalid ByteArray reference: ' + refIndex);
    }
    return info.amf3ObjectReferences[refIndex];
  }
  
  var length = header >> 1;
  
  var offset = info.offset;
  bytesUsed(info, length);
  var byteArray = Buffer.alloc(length);
  buffer.copy(byteArray, 0, offset, offset + length);
  
  // Add to reference table
  info.amf3ObjectReferences.push(byteArray);
  
  return byteArray;
}
