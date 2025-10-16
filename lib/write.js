
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

module.exports = write;

/**
 * Writes an AMF value to the specified Buffer at the specified offset.
 *
 * @param {Buffer} buffer The Buffer instance to write to.
 * @param {?} value the value to serialize as AMF data in `buffer`.
 * @param {Object|Number} info "Options" object, or the byte offset to begin reading from.
 * @api public
 */

function write(buffer, value, info) {
  if ('number' == typeof info) info = { offset: info };
  if (!info) info = {};
  if (null == info.offset) info.offset = 0;
  if (null == info.version) info.version = 0; // Default to AMF0

  var type = null == info.type ? getType(value, info) : info.type;

  // gets reset to 0 on each `write()` call
  info.byteLength = 0;

  if (info.version === 0) {
    // AMF0 serialization
    // write the "type" byte
    buffer.writeUInt8(type, info.offset);
    bytesUsed(info, 1);

    switch (type) {
      case amf0Types.kNumberType:
        writeNumber(buffer, value, info);
        break;
      case amf0Types.kBooleanType:
        writeBoolean(buffer, value, info);
        break;
      case amf0Types.kStringType:
        writeString(buffer, value, info);
        break;
      case amf0Types.kObjectType:
        writeObject(buffer, value, info);
        break;
      case amf0Types.kNullType:
      case amf0Types.kUndefinedType:
        break; // nothing to do for these two...
      case amf0Types.kReferenceType:
        writeReference(buffer, value, info);
        break;
      case amf0Types.kECMAArrayType:
        writeECMAArray(buffer, value, info);
        break;
      case amf0Types.kObjectEndType:
        break; // nothing to do...
      case amf0Types.kStrictArrayType:
        writeStrictArray(buffer, value, info);
        break;
      case amf0Types.kDateType:
        writeDate(buffer, value, info);
        break;
      case amf0Types.kTypedObjectType:
        writeTypedObject(buffer, value, info);
        break;
      case amf0Types.kAvmPlusObjectType:
        // Switch to AMF3 mode
        info.version = 3;
        writeAmf3(buffer, value, info);
        break;
      default:
        throw new Error('AMF0 type not yet implemented: ' + type);
    }
  } else {
    // AMF3 serialization
    writeAmf3(buffer, value, info);
  }

  return info.byteLength;
}

function bytesUsed(info, n) {
  info.offset += n;
  info.byteLength += n;
}

function getType(value, info) {
  if (null === value) return amf0Types.kNullType;
  if (undefined === value) return amf0Types.kUndefinedType;
  if (END_OBJECT === value) return amf0Types.kObjectEndType;

  // Check if we should use AMF3
  if (info.version === 3) {
    return getTypeAmf3(value, info);
  }

  var type = typeof value;
  if ('number' === type) return amf0Types.kNumberType;
  if ('boolean' === type) return amf0Types.kBooleanType;
  if ('string' === type) return amf0Types.kStringType;
  if ('object' === type) {
    if (isReference(value, info)) return amf0Types.kReferenceType;
    if (Array.isArray(value)) return amf0Types.kECMAArrayType;
    // Check if object has AMF3 marker
    if (value.__amf3__) return amf0Types.kAvmPlusObjectType;
    return amf0Types.kObjectType;
  }
  throw new Error('could not infer AMF "type" for ' + value);
}

function getTypeAmf3(value, info) {
  if (null === value) return amf3Types.kNullType;
  if (undefined === value) return amf3Types.kUndefinedType;

  var type = typeof value;
  if ('boolean' === type) return value ? amf3Types.kTrueType : amf3Types.kFalseType;
  if ('number' === type) {
    // Check if integer or double
    if (Number.isInteger(value) && value >= -268435456 && value <= 268435455) {
      return amf3Types.kIntegerType;
    }
    return amf3Types.kDoubleType;
  }
  if ('string' === type) return amf3Types.kStringType;
  if ('object' === type) {
    if (value instanceof Date) return amf3Types.kDateType;
    if (value instanceof Buffer) return amf3Types.kByteArrayType;
    if (Array.isArray(value)) return amf3Types.kArrayType;
    if (value.__type__ === 'XML') return amf3Types.kXMLType;
    if (value.__type__ === 'XMLDocument') return amf3Types.kAvmPlusXmlType;
    return amf3Types.kObjectType;
  }
  throw new Error('could not infer AMF3 "type" for ' + value);
}

// 2.2 Number Type

function writeNumber(buffer, value, info) {
  var offset = info.offset;
  bytesUsed(info, 8);
  return buffer.writeDoubleBE(value, offset);
}

// 2.3 Boolean Type

function writeBoolean(buffer, value, info) {
  var offset = info.offset;
  bytesUsed(info, 1);
  return buffer.writeUInt8(value ? 1 : 0, offset);
}

// 2.4 String Type

function writeString(buffer, value, info) {
  var offset = info.offset;
  var encoding = 'utf8';

  // first write the byte length of the utf8 string
  var length = Buffer.byteLength(value, encoding);
  buffer.writeUInt16BE(length, offset);
  bytesUsed(info, 2);

  // second write the utf8 string bytes
  offset = info.offset;
  bytesUsed(info, length);
  var b = buffer.write(value, offset, length, encoding);
  assert.equal(b, length, 'failed to write entire String ' +
    JSON.stringify(value) + ' to Buffer with length ' + buffer.length +
    ' at offset ' + offset + '. Wrote ' + b + ' bytes, expected ' + length);
  return b;
}

// 2.5 Object Type

function writeObject(buffer, object, info) {
  var keys = Object.keys(object);
  var key, value;

  if (!info.references) info.references = [];
  info.references.push(object);

  // loop through all the keys and write their keys ana values
  var temp = {};
  for (var i = 0; i < keys.length; i++) {
    // write the "key"
    temp.offset = info.offset;
    temp.byteLength = 0;
    key = keys[i];
    writeString(buffer, key, temp);
    bytesUsed(info, temp.byteLength);

    // write the "value"
    temp.offset = info.offset;
    temp.references = info.references;
    value = object[key];
    write(buffer, value, temp);
    bytesUsed(info, temp.byteLength);
  }

  // now write the "end object" marker
  temp.offset = info.offset;
  temp.byteLength = 0;
  writeString(buffer, '', temp);
  bytesUsed(info, temp.byteLength);

  temp.offset = info.offset;
  write(buffer, END_OBJECT, temp);
  bytesUsed(info, temp.byteLength);
}

// 2.9 Reference Type

function writeReference(buffer, value, info) {
  var refs = info.references;
  var offset = info.offset;

  // first figure out the index of the reference
  for (var i = 0; i < refs.length; i++) {
    if (refs[i] === value) break;
  }

  bytesUsed(info, 2);
  buffer.writeUInt16BE(i, offset);
}

function isReference(value, info) {
  var rtn = false;
  var refs = info.references;
  if (refs) {
    for (var i = 0; i < refs.length; i++) {
      if (refs[i] === value) {
        rtn = true;
        break;
      }
    }
  }
  return rtn;
}

// 2.10 ECMA Array Type

function writeECMAArray(buffer, array, info) {

  // first write the array length
  buffer.writeUInt32BE(array.length, info.offset);
  bytesUsed(info, 4);

  // at this point it's the same binary structure as a regular Object
  writeObject(buffer, array, info);
}

// 2.11 Object End Type

// sentinel object that signifies the "end" of an ECMA Object/Array
var END_OBJECT = { endObject: true };

/**
 * AMF3 implementation
 */

function writeAmf3(buffer, value, info) {
  // Initialize reference tables if they don't exist
  if (!info.amf3StringReferences) info.amf3StringReferences = [];
  if (!info.amf3ObjectReferences) info.amf3ObjectReferences = [];
  if (!info.amf3TraitReferences) info.amf3TraitReferences = [];

  var type = getTypeAmf3(value, info);

  // Write the type marker
  buffer.writeUInt8(type, info.offset);
  bytesUsed(info, 1);

  switch (type) {
    case amf3Types.kUndefinedType:
    case amf3Types.kNullType:
      // Nothing to do
      break;
    case amf3Types.kFalseType:
    case amf3Types.kTrueType:
      // Nothing to do, type marker is enough
      break;
    case amf3Types.kIntegerType:
      writeAmf3Integer(buffer, value, info);
      break;
    case amf3Types.kDoubleType:
      writeAmf3Double(buffer, value, info);
      break;
    case amf3Types.kStringType:
      writeAmf3String(buffer, value, info);
      break;
    case amf3Types.kXMLType:
    case amf3Types.kAvmPlusXmlType:
      writeAmf3XML(buffer, value, info, type === amf3Types.kAvmPlusXmlType);
      break;
    case amf3Types.kDateType:
      writeAmf3Date(buffer, value, info);
      break;
    case amf3Types.kArrayType:
      writeAmf3Array(buffer, value, info);
      break;
    case amf3Types.kObjectType:
      writeAmf3Object(buffer, value, info);
      break;
    case amf3Types.kByteArrayType:
      writeAmf3ByteArray(buffer, value, info);
      break;
    default:
      throw new Error('AMF3 type not yet implemented: ' + type);
  }
}

function writeAmf3Integer(buffer, value, info) {
  // AMF3 represents integers with a variable-length 29-bit encoding
  if (value < 0 || value >= 0x20000000) {
    throw new Error('Integer out of range: ' + value);
  }

  if (value < 0x80) {
    // 1 byte
    buffer.writeUInt8(value, info.offset);
    bytesUsed(info, 1);
  } else if (value < 0x4000) {
    // 2 bytes
    buffer.writeUInt8(0x80 | ((value >> 7) & 0x7F), info.offset);
    buffer.writeUInt8(value & 0x7F, info.offset + 1);
    bytesUsed(info, 2);
  } else if (value < 0x200000) {
    // 3 bytes
    buffer.writeUInt8(0x80 | ((value >> 14) & 0x7F), info.offset);
    buffer.writeUInt8(0x80 | ((value >> 7) & 0x7F), info.offset + 1);
    buffer.writeUInt8(value & 0x7F, info.offset + 2);
    bytesUsed(info, 3);
  } else {
    // 4 bytes
    buffer.writeUInt8(0x80 | ((value >> 22) & 0x7F), info.offset);
    buffer.writeUInt8(0x80 | ((value >> 15) & 0x7F), info.offset + 1);
    buffer.writeUInt8(0x80 | ((value >> 8) & 0x7F), info.offset + 2);
    buffer.writeUInt8(value & 0xFF, info.offset + 3);
    bytesUsed(info, 4);
  }
}

function writeAmf3Double(buffer, value, info) {
  buffer.writeDoubleBE(value, info.offset);
  bytesUsed(info, 8);
}

function writeAmf3String(buffer, value, info) {
  // Check if string is in reference table
  for (var i = 0; i < info.amf3StringReferences.length; i++) {
    if (info.amf3StringReferences[i] === value) {
      // Write reference
      writeAmf3Integer(buffer, i << 1, info);
      return;
    }
  }

  // Empty string is special case
  if (value === '') {
    writeAmf3Integer(buffer, 1, info); // (0 << 1) | 1
    return;
  }

  // Add to reference table
  info.amf3StringReferences.push(value);

  // Write string length (length << 1) | 1
  var byteLength = Buffer.byteLength(value, 'utf8');
  writeAmf3Integer(buffer, (byteLength << 1) | 1, info);

  // Write string bytes
  buffer.write(value, info.offset, byteLength, 'utf8');
  bytesUsed(info, byteLength);
}

function writeAmf3Date(buffer, value, info) {
  // Check if date is in reference table
  for (var i = 0; i < info.amf3ObjectReferences.length; i++) {
    if (info.amf3ObjectReferences[i] === value) {
      // Write reference
      writeAmf3Integer(buffer, i << 1, info);
      return;
    }
  }

  // Add to reference table
  info.amf3ObjectReferences.push(value);

  // Write header (no time zone in AMF3)
  writeAmf3Integer(buffer, 1, info); // (0 << 1) | 1

  // Write date value
  buffer.writeDoubleBE(value.getTime(), info.offset);
  bytesUsed(info, 8);
}

function writeAmf3Array(buffer, value, info) {
  // Check if array is in reference table
  for (var i = 0; i < info.amf3ObjectReferences.length; i++) {
    if (info.amf3ObjectReferences[i] === value) {
      // Write reference
      writeAmf3Integer(buffer, i << 1, info);
      return;
    }
  }

  // Add to reference table
  info.amf3ObjectReferences.push(value);

  // Get array length and check for associative keys
  var length = value.length || 0;
  var associativeKeys = [];

  for (var key in value) {
    if (value.hasOwnProperty(key) &&
      !(parseInt(key) >= 0 && parseInt(key) < length)) {
      associativeKeys.push(key);
    }
  }

  // Write array length (length << 1) | 1
  writeAmf3Integer(buffer, (length << 1) | 1, info);

  // Write associative keys (or empty string to end)
  for (var i = 0; i < associativeKeys.length; i++) {
    writeAmf3String(buffer, associativeKeys[i], info);
    writeAmf3(buffer, value[associativeKeys[i]], info);
  }

  // Empty string marks end of associative part
  writeAmf3String(buffer, '', info);

  // Write dense array elements
  for (var i = 0; i < length; i++) {
    writeAmf3(buffer, value[i], info);
  }
}

function writeAmf3Object(buffer, value, info) {
  // Check if object is in reference table
  for (var i = 0; i < info.amf3ObjectReferences.length; i++) {
    if (info.amf3ObjectReferences[i] === value) {
      // Write reference
      writeAmf3Integer(buffer, i << 1, info);
      return;
    }
  }

  // Add to reference table
  info.amf3ObjectReferences.push(value);

  var className = value.__className__ || '';
  var isDynamic = true;
  var isExternalizable = value.__externalizable__ === true;
  var propertyNames = [];

  // Collect property names
  if (!isExternalizable) {
    for (var key in value) {
      if (value.hasOwnProperty(key) &&
        key !== '__className__' &&
        key !== '__externalizable__') {
        propertyNames.push(key);
      }
    }
  }

  // Write object header
  // Bits: [trait-ref=bit0=1 inline][trait-inline=bit1=1][externalizable=bit2][dynamic=bit3][propCount bits 4..]
  var header = 0x03; // inline object + inline trait

  if (isExternalizable) {
    header |= (1 << 2);
  } else {
    if (isDynamic) header |= (1 << 3);
    header |= (propertyNames.length << 4);
  }

  writeAmf3Integer(buffer, header, info);

  // Write class name
  writeAmf3String(buffer, className, info);

  // Write property definitions (for non-externalizable objects)
  if (!isExternalizable) {
    // Write property names
    for (var i = 0; i < propertyNames.length; i++) {
      // Keys in trait list must be AMF3 string WITHOUT marker (inline string header only)
      writeAmf3Integer(buffer, (Buffer.byteLength(propertyNames[i], 'utf8') << 1) | 1, info);
      var len = Buffer.byteLength(propertyNames[i], 'utf8');
      buffer.write(propertyNames[i], info.offset, len, 'utf8');
      bytesUsed(info, len);
    }

    // Write property values
    for (var i = 0; i < propertyNames.length; i++) {
      writeAmf3(buffer, value[propertyNames[i]], info);
    }

    // For dynamic objects, write dynamic properties
    if (isDynamic) {
      // Empty string without marker to terminate dynamic section
      writeAmf3Integer(buffer, 1, info);
    }
  }
  // For externalizable objects, custom serialization would go here
  // but we don't support that yet
}

function writeAmf3XML(buffer, value, info, isAvmPlus) {
  // Check if XML is in reference table
  for (var i = 0; i < info.amf3ObjectReferences.length; i++) {
    if (info.amf3ObjectReferences[i] === value) {
      // Write reference
      writeAmf3Integer(buffer, i << 1, info);
      return;
    }
  }

  // Add to reference table
  info.amf3ObjectReferences.push(value);

  // Get XML string
  var xmlStr = value.toString();
  var byteLength = Buffer.byteLength(xmlStr, 'utf8');

  // Write length (length << 1) | 1
  writeAmf3Integer(buffer, (byteLength << 1) | 1, info);

  // Write XML bytes
  buffer.write(xmlStr, info.offset, byteLength, 'utf8');
  bytesUsed(info, byteLength);
}

function writeAmf3ByteArray(buffer, value, info) {
  // Check if ByteArray is in reference table
  for (var i = 0; i < info.amf3ObjectReferences.length; i++) {
    if (info.amf3ObjectReferences[i] === value) {
      // Write reference
      writeAmf3Integer(buffer, i << 1, info);
      return;
    }
  }

  // Add to reference table
  info.amf3ObjectReferences.push(value);

  // Write length (length << 1) | 1
  writeAmf3Integer(buffer, (value.length << 1) | 1, info);

  // Write bytes
  value.copy(buffer, info.offset);
  bytesUsed(info, value.length);
}

function writeAmf3Integer(buffer, value, info) {
  // AMF3 represents integers with a variable-length 29-bit encoding
  if (value < 0 || value >= 0x20000000) {
    throw new Error('Integer out of range: ' + value);
  }

  if (value < 0x80) {
    // 1 byte
    buffer.writeUInt8(value, info.offset);
    bytesUsed(info, 1);
  } else if (value < 0x4000) {
    // 2 bytes
    buffer.writeUInt8(0x80 | ((value >> 7) & 0x7F), info.offset);
    buffer.writeUInt8(value & 0x7F, info.offset + 1);
    bytesUsed(info, 2);
  } else if (value < 0x200000) {
    // 3 bytes
    buffer.writeUInt8(0x80 | ((value >> 14) & 0x7F), info.offset);
    buffer.writeUInt8(0x80 | ((value >> 7) & 0x7F), info.offset + 1);
    buffer.writeUInt8(value & 0x7F, info.offset + 2);
    bytesUsed(info, 3);
  } else {
    // 4 bytes
    buffer.writeUInt8(0x80 | ((value >> 22) & 0x7F), info.offset);
    buffer.writeUInt8(0x80 | ((value >> 15) & 0x7F), info.offset + 1);
    buffer.writeUInt8(0x80 | ((value >> 8) & 0x7F), info.offset + 2);
    buffer.writeUInt8(value & 0xFF, info.offset + 3);
    bytesUsed(info, 4);
  }
}

function writeAmf3Double(buffer, value, info) {
  buffer.writeDoubleBE(value, info.offset);
  bytesUsed(info, 8);
}

function writeAmf3String(buffer, value, info) {
  // Check if string is in reference table
  for (var i = 0; i < info.amf3StringReferences.length; i++) {
    if (info.amf3StringReferences[i] === value) {
      // Write reference
      writeAmf3Integer(buffer, i << 1, info);
      return;
    }
  }

  // Empty string is special case
  if (value === '') {
    writeAmf3Integer(buffer, 1, info); // (0 << 1) | 1
    return;
  }

  // Add to reference table
  info.amf3StringReferences.push(value);

  // Write string length (length << 1) | 1
  var byteLength = Buffer.byteLength(value, 'utf8');
  writeAmf3Integer(buffer, (byteLength << 1) | 1, info);

  // Write string bytes
  buffer.write(value, info.offset, byteLength, 'utf8');
  bytesUsed(info, byteLength);
}

function writeAmf3Date(buffer, value, info) {
  // Check if date is in reference table
  for (var i = 0; i < info.amf3ObjectReferences.length; i++) {
    if (info.amf3ObjectReferences[i] === value) {
      // Write reference
      writeAmf3Integer(buffer, i << 1, info);
      return;
    }
  }

  // Add to reference table
  info.amf3ObjectReferences.push(value);

  // Write header (no time zone in AMF3)
  writeAmf3Integer(buffer, 1, info); // (0 << 1) | 1

  // Write date value
  buffer.writeDoubleBE(value.getTime(), info.offset);
  bytesUsed(info, 8);
}

function writeAmf3Array(buffer, value, info) {
  // Check if array is in reference table
  for (var i = 0; i < info.amf3ObjectReferences.length; i++) {
    if (info.amf3ObjectReferences[i] === value) {
      // Write reference
      writeAmf3Integer(buffer, i << 1, info);
      return;
    }
  }

  // Add to reference table
  info.amf3ObjectReferences.push(value);

  // Get array length and check for associative keys
  var length = value.length || 0;
  var associativeKeys = [];

  for (var key in value) {
    if (value.hasOwnProperty(key) &&
      !(parseInt(key) >= 0 && parseInt(key) < length)) {
      associativeKeys.push(key);
    }
  }

  // Write array length (length << 1) | 1
  writeAmf3Integer(buffer, (length << 1) | 1, info);

  // Write associative keys (or empty string to end)
  for (var i = 0; i < associativeKeys.length; i++) {
    writeAmf3String(buffer, associativeKeys[i], info);
    writeAmf3(buffer, value[associativeKeys[i]], info);
  }

  // Empty string marks end of associative part
  writeAmf3String(buffer, '', info);

  // Write dense array elements
  for (var i = 0; i < length; i++) {
    writeAmf3(buffer, value[i], info);
  }
}

function writeAmf3Object(buffer, value, info) {
  // Check if object is in reference table
  for (var i = 0; i < info.amf3ObjectReferences.length; i++) {
    if (info.amf3ObjectReferences[i] === value) {
      // Write reference
      writeAmf3Integer(buffer, i << 1, info);
      return;
    }
  }

  // Add to reference table
  info.amf3ObjectReferences.push(value);

  var className = value.__className__ || '';
  var isDynamic = true;
  var isExternalizable = value.__externalizable__ === true;
  var propertyNames = [];

  // Collect property names
  if (!isExternalizable) {
    for (var key in value) {
      if (value.hasOwnProperty(key) &&
        key !== '__className__' &&
        key !== '__externalizable__') {
        propertyNames.push(key);
      }
    }
  }

  // Write object header
  // Bits: [trait-ref=bit0=1 inline][trait-inline=bit1=1][externalizable=bit2][dynamic=bit3][propCount bits 4..]
  var header = 0x03; // inline object + inline trait

  if (isExternalizable) {
    header |= (1 << 2);
  } else {
    if (isDynamic) header |= (1 << 3);
    header |= (propertyNames.length << 4);
  }

  writeAmf3Integer(buffer, header, info);

  // Write class name
  writeAmf3String(buffer, className, info);

  // Write property definitions (for non-externalizable objects)
  if (!isExternalizable) {
    // Write property names
    for (var i = 0; i < propertyNames.length; i++) {
      writeAmf3String(buffer, propertyNames[i], info);
    }

    // Write property values
    for (var i = 0; i < propertyNames.length; i++) {
      writeAmf3(buffer, value[propertyNames[i]], info);
    }

    // For dynamic objects, write dynamic properties
    if (isDynamic) {
      // Dynamic properties are already included in propertyNames
      // Write empty string to mark end of dynamic properties
      writeAmf3String(buffer, '', info);
    }
  }
  // For externalizable objects, custom serialization would go here
  // but we don't support that yet
}

function writeAmf3XML(buffer, value, info, isAvmPlus) {
  // Check if XML is in reference table
  for (var i = 0; i < info.amf3ObjectReferences.length; i++) {
    if (info.amf3ObjectReferences[i] === value) {
      // Write reference
      writeAmf3Integer(buffer, i << 1, info);
      return;
    }
  }

  // Add to reference table
  info.amf3ObjectReferences.push(value);

  // Get XML string
  var xmlStr = value.toString();
  var byteLength = Buffer.byteLength(xmlStr, 'utf8');

  // Write length (length << 1) | 1
  writeAmf3Integer(buffer, (byteLength << 1) | 1, info);

  // Write XML bytes
  buffer.write(xmlStr, info.offset, byteLength, 'utf8');
  bytesUsed(info, byteLength);
}

function writeAmf3ByteArray(buffer, value, info) {
  // Check if ByteArray is in reference table
  for (var i = 0; i < info.amf3ObjectReferences.length; i++) {
    if (info.amf3ObjectReferences[i] === value) {
      // Write reference
      writeAmf3Integer(buffer, i << 1, info);
      return;
    }
  }

  // Add to reference table
  info.amf3ObjectReferences.push(value);

  // Write length (length << 1) | 1
  writeAmf3Integer(buffer, (value.length << 1) | 1, info);

  // Write bytes
  value.copy(buffer, info.offset);
  bytesUsed(info, value.length);
}
