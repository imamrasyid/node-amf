"use strict";

// U29 variable-length integer reader for AMF3
// Reads 1–4 bytes, with the first three bytes using 7 data bits (MSB as continuation),
// and the fourth byte using all 8 bits. Max value is 0x1FFFFFFF (29 bits).

/**
 * Reads an unsigned 29-bit variable-length integer (U29) from a Buffer.
 *
 * The current read position is stored in `offsetRef.offset` and will be
 * advanced by 1–4 bytes depending on the encoded value.
 *
 * @param {Buffer} buffer - Source buffer
 * @param {{ offset: number }} offsetRef - Mutable offset holder
 * @returns {number} Unsigned 32-bit integer (0 .. 0x1FFFFFFF)
 */
function readU29(buffer, offsetRef) {
    let offset = offsetRef.offset >>> 0;
    let value = 0 >>> 0;

    let byte = buffer[offset++];
    if (byte < 128) {
        value = byte >>> 0;
    } else {
        value = (byte & 0x7F) << 7;
        byte = buffer[offset++];
        if (byte < 128) {
            value |= byte;
        } else {
            value = (value | (byte & 0x7F)) << 7;
            byte = buffer[offset++];
            if (byte < 128) {
                value |= byte;
            } else {
                value = (value | (byte & 0x7F)) << 8;
                byte = buffer[offset++];
                value |= byte;
            }
        }
    }

    offsetRef.offset = offset >>> 0;
    return value >>> 0;
}

module.exports = {
    readU29
};


