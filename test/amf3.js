/**
 * Module dependencies.
 */

var fs = require('fs');
var amf = require('../');
var path = require('path');
var util = require('util');
var assert = require('assert');

describe('AMF3 Support', function () {

  describe('read()', function () {
    it('should read AMF3 null value', function () {
      var buffer = Buffer.from([0x01]);
      var obj = amf.read(buffer, { version: 3 });
      assert.strictEqual(null, obj);
    });

    it('should read AMF3 false value', function () {
      var buffer = Buffer.from([0x02]);
      var obj = amf.read(buffer, { version: 3 });
      assert.strictEqual(false, obj);
    });

    it('should read AMF3 true value', function () {
      var buffer = Buffer.from([0x03]);
      var obj = amf.read(buffer, { version: 3 });
      assert.strictEqual(true, obj);
    });

    it('should read AMF3 integer values', function () {
      // Small integer (0-127)
      var buffer1 = Buffer.from([0x04, 0x15]); // 21
      var obj1 = amf.read(buffer1, { version: 3 });
      assert.strictEqual(21, obj1);

      // Medium integer
      var buffer2 = Buffer.from([0x04, 0x80, 0x50]); // 80 (U29 encoding)
      var obj2 = amf.read(buffer2, { version: 3 });
      assert.strictEqual(80, obj2);

      // Large integer
      var buffer3 = Buffer.from([0x04, 0x81, 0x80, 0x00]); // 16384 (U29 encoding)
      var obj3 = amf.read(buffer3, { version: 3 });
      assert.strictEqual(16384, obj3);
    });

    it('should read AMF3 double values', function () {
      var buffer = Buffer.alloc(9);
      buffer[0] = 0x05; // AMF3 double marker
      buffer.writeDoubleBE(3.14159, 1);
      var obj = amf.read(buffer, { version: 3 });
      assert.strictEqual(3.14159, obj);
    });

    it('should read AMF3 string values', function () {
      // Empty string
      var buffer1 = Buffer.from([0x06, 0x01]);
      var obj1 = amf.read(buffer1, { version: 3 });
      assert.strictEqual('', obj1);

      // Simple string
      var buffer2 = Buffer.from([0x06, 0x0B, 0x68, 0x65, 0x6C, 0x6C, 0x6F]);
      var obj2 = amf.read(buffer2, { version: 3 });
      assert.strictEqual('hello', obj2);
    });

    it('should read AMF3 array values', function () {
      // Dense array [1, 2, 3]
      var buffer = Buffer.from([
        0x09, 0x07, 0x01, // Array marker, length 3, empty associative part
        0x04, 0x01,       // Integer 1
        0x04, 0x02,       // Integer 2
        0x04, 0x03        // Integer 3
      ]);
      var obj = amf.read(buffer, { version: 3 });
      assert.deepStrictEqual([1, 2, 3], obj);
    });

    it('should read AMF3 object values', function () {
      // Simple object { foo: 'bar' }
      var buffer = Buffer.from([
        0x0A, 0x0B, 0x01, // Object marker, class-def, dynamic
        0x07, 0x66, 0x6F, 0x6F, // 'foo'
        0x06, 0x07, 0x62, 0x61, 0x72, // 'bar'
        0x01 // empty string marker (end of dynamic properties)
      ]);
      var obj = amf.read(buffer, { version: 3 });
      assert.deepStrictEqual({ foo: 'bar' }, obj);
    });
  });

  describe('write()', function () {
    it('should write AMF3 null value', function () {
      var buffer = Buffer.alloc(1);
      var info = { version: 3 };
      var bytes = amf.write(buffer, null, info);
      assert.strictEqual(1, bytes);
      assert.strictEqual(0x01, buffer[0]);
    });

    it('should write AMF3 boolean values', function () {
      var buffer1 = Buffer.alloc(1);
      var info1 = { version: 3 };
      var bytes1 = amf.write(buffer1, false, info1);
      assert.strictEqual(1, bytes1);
      assert.strictEqual(0x02, buffer1[0]);

      var buffer2 = Buffer.alloc(1);
      var info2 = { version: 3 };
      var bytes2 = amf.write(buffer2, true, info2);
      assert.strictEqual(1, bytes2);
      assert.strictEqual(0x03, buffer2[0]);
    });

    it('should write AMF3 integer values', function () {
      // Small integer
      var buffer1 = Buffer.alloc(2);
      var info1 = { version: 3 };
      var bytes1 = amf.write(buffer1, 21, info1);
      assert.strictEqual(2, bytes1);
      assert.strictEqual(0x04, buffer1[0]); // Integer marker
      assert.strictEqual(0x15, buffer1[1]); // Value 21

      // Large integer
      var buffer2 = Buffer.alloc(4);
      var info2 = { version: 3 };
      var bytes2 = amf.write(buffer2, 16384, info2);
      assert.strictEqual(4, bytes2);
      assert.strictEqual(0x04, buffer2[0]); // Integer marker
    });

    it('should write AMF3 string values', function () {
      // Empty string
      var buffer1 = Buffer.alloc(2);
      var info1 = { version: 3 };
      var bytes1 = amf.write(buffer1, '', info1);
      assert.strictEqual(2, bytes1);
      assert.strictEqual(0x06, buffer1[0]); // String marker
      assert.strictEqual(0x01, buffer1[1]); // Empty string

      // Simple string
      var str = 'hello';
      var buffer2 = Buffer.alloc(str.length + 3);
      var info2 = { version: 3 };
      var bytes2 = amf.write(buffer2, str, info2);
      assert.strictEqual(7, bytes2); // 1 byte marker + 1 byte length + 5 bytes string
      assert.strictEqual(0x06, buffer2[0]); // String marker
    });

    it('should write AMF3 array values', function () {
      var arr = [1, 2, 3];
      var buffer = Buffer.alloc(20);
      var info = { version: 3 };
      var bytes = amf.write(buffer, arr, info);
      assert.strictEqual(0x09, buffer[0]); // Array marker
    });

    it('should write AMF3 object values', function () {
      var obj = { foo: 'bar' };
      var buffer = Buffer.alloc(20);
      var info = { version: 3 };
      var bytes = amf.write(buffer, obj, info);
      assert.strictEqual(0x0A, buffer[0]); // Object marker
    });
  });

  describe('Helper Functions', function () {
    it('should create AMF3 objects with className', function () {
      var obj = amf.createAmf3Object({ name: 'Test' }, 'com.example.TestClass');
      assert.strictEqual(true, obj.__amf3__);
      assert.strictEqual('com.example.TestClass', obj.__className__);
      assert.strictEqual('Test', obj.name);
    });

    it('should create AMF3 XML objects', function () {
      var xml = amf.createAmf3XML('<root><item>test</item></root>');
      assert.strictEqual(true, xml.__amf3__);
      assert.strictEqual('XML', xml.__type__);
      assert.strictEqual('<root><item>test</item></root>', xml.toString());
    });

    it('should create AMF3 ByteArray objects', function () {
      var buffer = Buffer.from([1, 2, 3, 4]);
      var byteArray = amf.createAmf3ByteArray(buffer);
      assert.strictEqual(true, byteArray.__amf3__);
      assert.strictEqual(buffer, byteArray);
    });
  });
});