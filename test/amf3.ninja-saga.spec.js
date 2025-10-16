var assert = require('assert');
var fs = require('fs');
var path = require('path');
var amf = require('..');

describe('AMF3 - Ninja Saga scaffolding', function () {
    it('U29 edge values round-trip via encoder scaffold', function () {
        var values = [0, 1, 127, 128, 16383, 16384, 2097151, 2097152, 0x1FFFFFFF];
        values.forEach(function (n) {
            var buf = amf.encode(n, { objectEncoding: 3 });
            var out = amf.decode(buf, { objectEncoding: 3 });
            assert.strictEqual(out, n);
        });
    });

    it('String refs encode once and decode correctly', function () {
        var obj = { a: 'ns', b: 'ns', c: 'ns' };
        var buf = amf.encode(obj, { objectEncoding: 3 });
        var out = amf.decode(buf, { objectEncoding: 3 });
        assert.strictEqual(out.a, 'ns');
        assert.strictEqual(out.b, 'ns');
        assert.strictEqual(out.c, 'ns');
    });

    it('Array associative + dense parts decode', function () {
        var arr = ['x', 'y', 'z'];
        arr.a = 1; arr.b = 2;
        var buf = amf.encode(arr, { objectEncoding: 3 });
        var out = amf.decode(buf, { objectEncoding: 3 });
        assert.strictEqual(out[0], 'x');
        assert.strictEqual(out[2], 'z');
        assert.strictEqual(out.a, 1);
        assert.strictEqual(out.b, 2);
    });

    it('Date preserves millis (UTC)', function () {
        var d = new Date(0);
        var buf = amf.encode(d, { objectEncoding: 3 });
        var out = amf.decode(buf, { objectEncoding: 3 });
        assert.strictEqual(out.getTime(), 0);
    });
});


