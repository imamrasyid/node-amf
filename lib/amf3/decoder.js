"use strict";

// AMF3 Decoder scaffold. This is a template providing structure, constants,
// reference tables, and public API. Implement individual read handlers
// incrementally alongside tests.

const { readU29 } = require("../utils/u29");

// AMF3 Type Markers
const AMF3_MARKER = {
    UNDEFINED: 0x00,
    NULL: 0x01,
    FALSE: 0x02,
    TRUE: 0x03,
    INTEGER: 0x04, // U29
    DOUBLE: 0x05,  // IEEE-754 double (BE)
    STRING: 0x06,  // U29 string ref/inline
    XMLDOC: 0x07,
    DATE: 0x08,
    ARRAY: 0x09,
    OBJECT: 0x0A,
    XML: 0x0B,
    BYTEARRAY: 0x0C,
    VECTOR_INT: 0x0D,
    VECTOR_UINT: 0x0E,
    VECTOR_DOUBLE: 0x0F,
    VECTOR_OBJECT: 0x10,
    DICTIONARY: 0x11
};

class AMF3Decoder {
    constructor(buffer) {
        this.buffer = buffer;
        this.offsetRef = { offset: 0 };

        // Reference tables; reset per message
        this.stringRefs = [];
        this.objectRefs = [];
        this.traitRefs = [];
    }

    resetRefs() {
        this.stringRefs.length = 0;
        this.objectRefs.length = 0;
        this.traitRefs.length = 0;
    }

    readValue() {
        const marker = this._readU8();
        switch (marker) {
            case AMF3_MARKER.UNDEFINED: return undefined;
            case AMF3_MARKER.NULL: return null;
            case AMF3_MARKER.FALSE: return false;
            case AMF3_MARKER.TRUE: return true;
            case AMF3_MARKER.INTEGER: return this._readInteger();
            case AMF3_MARKER.DOUBLE: return this._readDouble();
            case AMF3_MARKER.STRING: return this._readString();
            case AMF3_MARKER.XMLDOC: return this._readXMLDoc();
            case AMF3_MARKER.DATE: return this._readDate();
            case AMF3_MARKER.ARRAY: return this._readArray();
            case AMF3_MARKER.OBJECT: return this._readObject();
            case AMF3_MARKER.XML: return this._readXML();
            case AMF3_MARKER.BYTEARRAY: return this._readByteArray();
            case AMF3_MARKER.VECTOR_INT: return this._readVectorInt();
            case AMF3_MARKER.VECTOR_UINT: return this._readVectorUint();
            case AMF3_MARKER.VECTOR_DOUBLE: return this._readVectorDouble();
            case AMF3_MARKER.VECTOR_OBJECT: return this._readVectorObject();
            case AMF3_MARKER.DICTIONARY: return this._readDictionary();
            default:
                throw new Error("UnknownAMF3Marker:" + marker);
        }
    }

    // ---- Primitive Readers ----
    _readU8() {
        const o = this.offsetRef.offset;
        const v = this.buffer[o];
        this.offsetRef.offset = (o + 1) >>> 0;
        return v;
    }

    _readDouble() {
        const o = this.offsetRef.offset;
        const value = this.buffer.readDoubleBE(o);
        this.offsetRef.offset = (o + 8) >>> 0;
        return value;
    }

    _readInteger() {
        // U29 with sign extension for 28-bit signed range [-268435456 .. 268435455]
        const u29 = readU29(this.buffer, this.offsetRef) >>> 0;
        if (u29 & 0x10000000) {
            return (u29 | 0xE0000000) >> 0;
        }
        return u29 >> 0;
    }

    _readUTF8(length) {
        const o = this.offsetRef.offset;
        const slice = this.buffer.slice(o, o + length);
        this.offsetRef.offset = (o + length) >>> 0;
        return slice.toString("utf8");
    }

    // ---- Complex Readers (stubs to implement) ----
    _readString() {
        const u29 = readU29(this.buffer, this.offsetRef);
        const isRef = (u29 & 1) === 0;
        const refIndex = u29 >>> 1;
        if (isRef) {
            return this.stringRefs[refIndex];
        }
        const length = refIndex >>> 0;
        if (length === 0) {
            return "";
        }
        const str = this._readUTF8(length);
        this.stringRefs.push(str);
        return str;
    }

    _readXMLDoc() {
        // spec: String ref/int followed by UTF-8 xml bytes
        const length = readU29(this.buffer, this.offsetRef) >>> 1; // always inline
        const xml = this._readUTF8(length);
        return xml; // keep as string; callers can parse
    }

    _readDate() {
        const header = readU29(this.buffer, this.offsetRef);
        const isRef = (header & 1) === 0;
        const refIndex = header >>> 1;
        if (isRef) {
            return this.objectRefs[refIndex];
        }
        const millis = this._readDouble();
        const d = new Date(millis);
        this.objectRefs.push(d);
        return d;
    }

    _readArray() {
        // header: U29 (dense length + low bit = 1 if inline)
        const header = readU29(this.buffer, this.offsetRef);
        const isRef = (header & 1) === 0;
        const denseLength = header >>> 1;
        if (isRef) {
            return this.objectRefs[denseLength];
        }

        const associative = {};
        while (true) {
            const key = this._readString();
            if (!key || key.length === 0) break;
            associative[key] = this.readValue();
        }

        const dense = new Array(denseLength);
        for (let i = 0; i < denseLength; i++) {
            dense[i] = this.readValue();
        }

        const arr = dense;
        // Attach associative entries
        for (const k in associative) {
            arr[k] = associative[k];
        }
        this.objectRefs.push(arr);
        return arr;
    }

    _readObject() {
        // trait header
        const header = readU29(this.buffer, this.offsetRef);
        const isRef = (header & 1) === 0;
        const info = header >>> 1;
        if (isRef) {
            return this.objectRefs[info];
        }

        const isTraitRef = (info & 1) === 0;
        if (isTraitRef) {
            const traitIndex = info >>> 1;
            const trait = this.traitRefs[traitIndex];
            return this._readObjectWithTrait(trait);
        }

        const isExternalizable = (info & 2) !== 0;
        const isDynamic = (info & 4) !== 0;
        const sealedCount = info >>> 3;
        const className = this._readString();

        const trait = {
            className,
            sealedCount,
            isDynamic,
            isExternalizable,
            sealedNames: new Array(sealedCount)
        };
        for (let i = 0; i < sealedCount; i++) {
            trait.sealedNames[i] = this._readString();
        }
        this.traitRefs.push(trait);

        return this._readObjectWithTrait(trait);
    }

    _readObjectWithTrait(trait) {
        const obj = {};
        this.objectRefs.push(obj);

        if (trait.isExternalizable) {
            // Placeholder: externalizable registry not implemented in scaffold
            // Consumers should extend decoder and override this path
            throw new Error("ExternalizableNotImplemented:" + trait.className);
        }

        // sealed fields
        for (let i = 0; i < trait.sealedCount; i++) {
            const name = trait.sealedNames[i];
            obj[name] = this.readValue();
        }

        // dynamic fields
        if (trait.isDynamic) {
            while (true) {
                const key = this._readString();
                if (!key || key.length === 0) break;
                obj[key] = this.readValue();
            }
        }

        // Attach class name metadata non-enumerably for debugging
        if (trait.className) {
            try {
                Object.defineProperty(obj, "__amf3ClassName", { value: trait.className, enumerable: false });
            } catch (_) { }
        }

        return obj;
    }

    _readXML() {
        const length = readU29(this.buffer, this.offsetRef) >>> 1; // inline
        const xml = this._readUTF8(length);
        return xml;
    }

    _readByteArray() {
        const header = readU29(this.buffer, this.offsetRef);
        const isRef = (header & 1) === 0;
        const length = header >>> 1;
        if (isRef) {
            return this.objectRefs[length];
        }
        const o = this.offsetRef.offset;
        const slice = this.buffer.slice(o, o + length);
        this.offsetRef.offset = (o + length) >>> 0;
        this.objectRefs.push(slice);
        return slice;
    }

    _readVectorInt() {
        return this._readVectorPrimitive((buf, offRef) => {
            const v = buf.readInt32BE(offRef.offset);
            offRef.offset = (offRef.offset + 4) >>> 0;
            return v;
        });
    }

    _readVectorUint() {
        return this._readVectorPrimitive((buf, offRef) => {
            const v = buf.readUInt32BE(offRef.offset);
            offRef.offset = (offRef.offset + 4) >>> 0;
            return v >>> 0;
        });
    }

    _readVectorDouble() {
        return this._readVectorPrimitive((buf, offRef) => {
            const v = buf.readDoubleBE(offRef.offset);
            offRef.offset = (offRef.offset + 8) >>> 0;
            return v;
        });
    }

    _readVectorObject() {
        const header = readU29(this.buffer, this.offsetRef);
        const isRef = (header & 1) === 0;
        const length = header >>> 1;
        if (isRef) {
            return this.objectRefs[length];
        }
        const fixed = this._readU8() !== 0; // 0 = dynamic, 1 = fixed
        const typeName = this._readString(); // may be empty
        const arr = new Array(length);
        this.objectRefs.push(arr);
        for (let i = 0; i < length; i++) {
            arr[i] = this.readValue();
        }
        // attach vector metadata
        try {
            Object.defineProperty(arr, "__amf3Vector", { value: { typeName, fixed }, enumerable: false });
        } catch (_) { }
        return arr;
    }

    _readDictionary() {
        const header = readU29(this.buffer, this.offsetRef);
        const isRef = (header & 1) === 0;
        const size = header >>> 1;
        if (isRef) {
            return this.objectRefs[size];
        }
        const weakKeys = this._readU8() !== 0; // ignore in JS
        const map = Object.create(null);
        this.objectRefs.push(map);
        for (let i = 0; i < size; i++) {
            const key = this.readValue();
            const value = this.readValue();
            map[String(key)] = value;
        }
        try {
            Object.defineProperty(map, "__amf3WeakKeys", { value: weakKeys, enumerable: false });
        } catch (_) { }
        return map;
    }

    _readVectorPrimitive(readOne) {
        const header = readU29(this.buffer, this.offsetRef);
        const isRef = (header & 1) === 0;
        const length = header >>> 1;
        if (isRef) {
            return this.objectRefs[length];
        }
        const fixed = this._readU8() !== 0; // 0 = dynamic, 1 = fixed
        const arr = new Array(length);
        this.objectRefs.push(arr);
        for (let i = 0; i < length; i++) {
            arr[i] = readOne(this.buffer, this.offsetRef);
        }
        try {
            Object.defineProperty(arr, "__amf3Vector", { value: { fixed }, enumerable: false });
        } catch (_) { }
        return arr;
    }
}

module.exports = {
    AMF3Decoder,
    AMF3_MARKER
};


