0.2.0 / 2023-08-15
==================

 - Implementasi dukungan penuh untuk AMF3
 - Menambahkan fungsi read untuk AMF3 dengan dukungan tipe data: null, boolean, integer, double, string, array, object, XML, dan ByteArray
 - Menambahkan fungsi write untuk AMF3 dengan dukungan tipe data: null, boolean, integer, double, string, array, object, XML, dan ByteArray
 - Menambahkan deteksi versi AMF otomatis
 - Menambahkan fungsi helper untuk membuat objek AMF3, XML, dan ByteArray
 - Menambahkan unit test untuk semua fitur AMF3

0.1.0 / 2013-02-24
==================

 - Correct ECMA Array parsing logic
 - Implement "strict array" type reading support
 - Implement Date type reading support
 - Implement "typed object" reading support
 - Now you can pass in an "options" object with `offset`

0.0.1 / 2013-02-21
==================

 - Initial release
 - Only a partially implemented `read()` function so far, no `write()`...
 - Only version 0 supported so far, no version 3...
