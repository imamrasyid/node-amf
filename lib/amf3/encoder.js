"use strict";

// AMF3 Encoder scaffold to complement decoder. Covers common markers needed
// for Ninja Saga use-cases: Integer, Double, String (with refs), Date, Array,
// Object (traits/dynamic), ByteArray. Vectors/Dictionary can be added later.

function AMF3Encoder() {
    this.stringRefs = [];
    this.objectRefs = [];
    this.traitRefs = [];
    this.chunks = [];
    this.length = 0;
}

AMF3Encoder.prototype._push = function (buf) {
    this.chunks.push(buf);
    this.length += buf.length >>> 0;
};

AMF3Encoder.prototype._u8 = function (v) {
    const b = Buffer.allocUnsafe(1);
    b[0] = v & 0xFF;
    this._push(b);
};

AMF3Encoder.prototype._u29 = function (u29) {
    if (u29 < 0 || u29 >= 0x20000000) {
        throw new Error("AMF3 U29 out of range: " + u29);
    }
    if (u29 < 0x80) {
        this._u8(u29);
    } else if (u29 < 0x4000) {
        this._u8(0x80 | ((u29 >> 7) & 0x7F));
        this._u8(u29 & 0x7F);
    } else if (u29 < 0x200000) {
        this._u8(0x80 | ((u29 >> 14) & 0x7F));
        this._u8(0x80 | ((u29 >> 7) & 0x7F));
        this._u8(u29 & 0x7F);
    } else {
        this._u8(0x80 | ((u29 >> 22) & 0x7F));
        this._u8(0x80 | ((u29 >> 15) & 0x7F));
        this._u8(0x80 | ((u29 >> 8) & 0x7F));
        this._u8(u29 & 0xFF);
    }
};

AMF3Encoder.prototype.encodeValue = function (value) {
    if (value === undefined) return this._u8(0x00);
    if (value === null) return this._u8(0x01);
    if (value === false) return this._u8(0x02);
    if (value === true) return this._u8(0x03);
    if (typeof value === "number") {
        if (Number.isInteger(value) && value >= -268435456 && value <= 268435455) {
            this._u8(0x04);
            // sign-adjust into U29
            let u29 = value & 0x1FFFFFFF;
            this._u29(u29 >>> 0);
        } else {
            this._u8(0x05);
            const b = Buffer.allocUnsafe(8);
            b.writeDoubleBE(value, 0);
            this._push(b);
        }
        return;
    }
    if (typeof value === "string") {
        this._u8(0x06);
        // reference lookup
        const idx = this.stringRefs.indexOf(value);
        if (idx !== -1) {
            this._u29(idx << 1);
            return;
        }
        if (value.length === 0) {
            this._u29(1);
            return;
        }
        this.stringRefs.push(value);
        const byteLength = Buffer.byteLength(value, "utf8");
        this._u29((byteLength << 1) | 1);
        this._push(Buffer.from(value, "utf8"));
        return;
    }
    if (value instanceof Date) {
        this._u8(0x08);
        const idx = this.objectRefs.indexOf(value);
        if (idx !== -1) { this._u29(idx << 1); return; }
        this.objectRefs.push(value);
        this._u29(1); // inline
        const b = Buffer.allocUnsafe(8);
        b.writeDoubleBE(value.getTime(), 0);
        this._push(b);
        return;
    }
    if (Buffer.isBuffer(value)) {
        this._u8(0x0C);
        const idx = this.objectRefs.indexOf(value);
        if (idx !== -1) { this._u29(idx << 1); return; }
        this.objectRefs.push(value);
        this._u29((value.length << 1) | 1);
        this._push(value);
        return;
    }
    if (Array.isArray(value)) {
        this._u8(0x09);
        const idx = this.objectRefs.indexOf(value);
        if (idx !== -1) { this._u29(idx << 1); return; }
        this.objectRefs.push(value);
        const length = value.length >>> 0;
        this._u29((length << 1) | 1);
        // associative part: scan non-index props
        const keys = Object.keys(value).filter(function (k) {
            var n = (+k >>> 0);
            return !(n < length && String(n) === k);
        });
        for (var i = 0; i < keys.length; i++) {
            this._writeAmf3StringNoMarker(keys[i]);
            this.encodeValue(value[keys[i]]);
        }
        // end of associative part: empty string without marker
        this._writeAmf3StringNoMarker("");
        for (var j = 0; j < length; j++) {
            this.encodeValue(value[j]);
        }
        return;
    }

    // Object with traits/dynamic
    this._u8(0x0A);
    const idx = this.objectRefs.indexOf(value);
    if (idx !== -1) { this._u29(idx << 1); return; }
    this.objectRefs.push(value);

    const className = value.__className__ || "";
    const isExternalizable = value.__externalizable__ === true;
    const isDynamic = true;
    if (isExternalizable) {
        // inline object (bit0=1), inline trait (bit1=1), externalizable (bit2=1)
        const header = 0x03 | (1 << 2);
        this._u29(header);
        this._writeAmf3StringNoMarker(className);
        throw new Error("ExternalizableNotImplemented:" + className);
    } else {
        // inline object (bit0=1), inline trait (bit1=1), dynamic (bit3), sealedCount
        const sealedCount = 0;
        const header = 0x03 | (isDynamic ? (1 << 3) : 0) | (sealedCount << 4);
        this._u29(header);
        this._writeAmf3StringNoMarker(className);
        // no sealed names
        // dynamic props
        const props = Object.keys(value).filter(function (k) { return k !== "__className__" && k !== "__externalizable__"; });
        for (var p = 0; p < props.length; p++) {
            this._writeAmf3StringNoMarker(props[p]);
            this.encodeValue(value[props[p]]);
        }
        this._writeAmf3StringNoMarker("");
    }
};

AMF3Encoder.prototype.finish = function () {
    return Buffer.concat(this.chunks, this.length >>> 0);
};

// Write AMF3 string header+bytes without emitting the 0x06 marker.
// Used for class names, trait names, and associative keys.
AMF3Encoder.prototype._writeAmf3StringNoMarker = function (value) {
    var idx = this.stringRefs.indexOf(value);
    if (idx !== -1) {
        this._u29(idx << 1); // reference (lsb 0)
        return;
    }
    if (value === "") {
        this._u29(1); // empty inline
        return;
    }
    this.stringRefs.push(value);
    var byteLength = Buffer.byteLength(value, "utf8");
    this._u29((byteLength << 1) | 1);
    this._push(Buffer.from(value, "utf8"));
};

module.exports = {
    AMF3Encoder
};





