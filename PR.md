## 🧠 Node-AMF (Enhanced) – Upgrade Plan to Full AMF3 Support

### 🎯 Tujuan

Fork ini menambah dukungan **AMF3 (Action Message Format v3)** di atas basis `TooTallNate/node-amf` (sebelumnya hanya AMF0), agar kompatibel dengan aplikasi **ActionScript 3 / Flash Player 9+** seperti Ninja Saga, Red5, dan AMFPHP Gateway.

---

## ⚙️ Pekerjaan Teknis yang Harus Dilakukan

### 1️⃣ Dukungan Marker & Tipe AMF3

Implementasi dan pengujian semua marker wajib berikut:

| Marker      | Tipe                                            | Catatan |
| ----------- | ----------------------------------------------- | ------- |
| 0x00        | Undefined                                       |         |
| 0x01        | Null                                            |         |
| 0x02        | False                                           |         |
| 0x03        | True                                            |         |
| 0x04        | Integer (U29 varint)                            |         |
| 0x05        | Double (IEEE-754)                               |         |
| 0x06        | String (U29 + ref)                              |         |
| 0x07        | XMLDocument                                     |         |
| 0x08        | Date                                            |         |
| 0x09        | Array (associative + dense)                     |         |
| 0x0A        | Object (sealed / dynamic / externalizable)      |         |
| 0x0B        | XML (E4X)                                       |         |
| 0x0C        | ByteArray                                       |         |
| 0x0D–0x10   | Vector<Int/Uint/Double/Object>                  |         |
| 0x11        | Dictionary                                      |         |
| 0x11 (AMF0) | AVMPlus marker – AMF0 envelope dengan body AMF3 |         |

Referensi: `guardianblue/node-amf3`, `ProjectCryo/AMF.js`, dan Adobe AMF3 spec.

### 2️⃣ Implementasi U29 (VarInt)

Encoder/decoder U29 valid 1–4 byte, batas **0x1FFFFFFF (29 bit)**.

- 1–3 byte → 7-bit + MSB=1
- Byte ke-4 → 8-bit penuh (MSB=0)
- Nilai > 0x1FFFFFFF → encode sebagai `Double`

### 3️⃣ Trait & Externalizable

- Trait info: `className`, `sealedCount`, `dynamic`, `externalizable`.
- Registry externalizable:

```js
Decoder.registerClass("my.custom.Class", {
  read(decoder) {
    /* ... */
  },
  write(encoder, obj) {
    /* ... */
  },
});
```

### 4️⃣ Reference Tables

- `stringRefs`, `objectRefs`, `traitRefs` ada dan reset per message.
- Hindari global state antar payload.

### 5️⃣ Bridging AMF0 → AMF3

Parser mendukung: **AMF0 envelope + body AMF3 (0x11)**

- Header & body di-decode AMF0.
- Jika marker `0x11` → lanjut decode body via AMF3.

### 6️⃣ Endian & Buffer Handling

- Gunakan Big Endian (`readDoubleBE`/`writeDoubleBE`).
- `Date` sebagai epoch millis UTC tanpa offset.

### 7️⃣ API Ideal

```js
const { decode, encode } = require("node-amf");

decode(buffer, { objectEncoding: 0 | 3 }); // auto detect
encode(object, { objectEncoding: 3 }); // AMF3

// atau class terpisah
const d3 = new AMF3Decoder(buffer);
const o = d3.readValue();
```

---

## 🧪 Test Suite yang Wajib Ada

### 🔢 U29 / Integer Test

Round-trip nilai:

```
0, 1, 127, 128, 16383, 16384, 2097151, 2097152, 0x1FFFFFFF
```

Nilai lebih besar → otomatis `Double`.

### 🧵 String Reference Test

String identik merefer ke entri pertama (tanpa duplikasi literal).

### 📚 Array Test

```js
{ "a": 1, "b": 2, length: 3, 0: "x", 1: "y", 2: "z" }
```

Associative + dense part ter-decode benar.

### 🧍 Object Test

- Sealed trait → field tetap
- Dynamic → field tambahan
- Externalizable → handler kustom terpanggil

### 🧱 ByteArray Test

- Length: 0, 1–100, ≥64KB
- Validasi isi sama

### 🕒 Date Test

- Epoch 0, now, negatif
- Akurat tanpa offset lokal

### 🌉 Envelope Test

AMF0 envelope dengan AMF3 body (`0x11`).

---

## ⚡ Kinerja & Keamanan

- Batasi panjang string/array sebelum allocate.
- Marker tidak dikenal → `UnknownAMF3Marker`.
- Opsi streaming decoder untuk ByteArray besar (opsional).
- Tambahkan quick fuzzer untuk varint & data rusak.

---

## 🧩 Struktur File Direkomendasikan

```
lib/
 ├─ amf0/
 │   ├─ decoder.js
 │   └─ encoder.js
 ├─ amf3/
 │   ├─ decoder.js
 │   └─ encoder.js
 ├─ index.js
 └─ utils/
     ├─ u29.js
     ├─ traits.js
     └─ refs.js
test/
 ├─ amf0.spec.js
 ├─ amf3.spec.js
 └─ fixtures/
```

---

## 🧰 Contoh Implementasi Decoder U29

```js
// utils/u29.js
function readU29(buf, offsetObj) {
  let offset = offsetObj.offset;
  let value = 0;
  let b = buf[offset++];
  if (b < 128) value = b;
  else {
    value = (b & 0x7f) << 7;
    b = buf[offset++];
    if (b < 128) value |= b;
    else {
      value = (value | (b & 0x7f)) << 7;
      b = buf[offset++];
      if (b < 128) value |= b;
      else {
        value = (value | (b & 0x7f)) << 8;
        b = buf[offset++];
        value |= b;
      }
    }
  }
  offsetObj.offset = offset;
  return value >>> 0;
}
module.exports = { readU29 };
```

---

## 🧾 Dokumentasi & Metadata

### 📄 README.md

```js
const fs = require("fs");
const { decode } = require("node-amf");

const buffer = fs.readFileSync("login.amf");
const data = decode(buffer, { objectEncoding: 3 });
console.log(data);
```

### 📦 package.json

```json
{
  "name": "@imamrasyid/node-amf",
  "version": "1.0.0-amf3.0",
  "description": "Extended AMF0/AMF3 encoder/decoder for Flash/AS3 applications",
  "author": "Imam Rasyid <youremail@example.com>",
  "license": "MIT",
  "repository": {
    "type": "git",
    "url": "https://github.com/imamrasyid/node-amf"
  }
}
```

### 🧾 CHANGELOG.md

```
## v1.0.0-amf3.0
- Added full AMF3 decoding/encoding support
- Added U29 varint parser
- Added trait, reference, and externalizable handling
- Added AMF0 envelope with AVMPlus marker (0x11)
- Improved test coverage for Date, ByteArray, and Array
```

---

## 🔍 Referensi

- Adobe AMF3 Specification (2008)
- https://github.com/guardianblue/node-amf3
- https://github.com/ProjectCryo/AMF.js
- https://github.com/TooTallNate/node-amf (upstream)
- https://github.com/imamrasyid/node-amf (this repo)
