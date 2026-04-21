// CJS shim for @exodus/bytes/encoding-lite.js
// Needed because jsdom 28 + html-encoding-sniffer 6 tries to require() this pure-ESM file.
// We redirect it to Node built-ins which are functionally equivalent for the test environment.
'use strict';

const { TextDecoder, TextEncoder, TextDecoderStream, TextEncoderStream } = globalThis;

function getBOMEncoding(uint8Array) {
  if (uint8Array[0] === 0xef && uint8Array[1] === 0xbb && uint8Array[2] === 0xbf) return 'UTF-8';
  if (uint8Array[0] === 0xfe && uint8Array[1] === 0xff) return 'UTF-16BE';
  if (uint8Array[0] === 0xff && uint8Array[1] === 0xfe) return 'UTF-16LE';
  return null;
}

function labelToName(label) {
  if (!label) return null;
  const l = label.trim().toLowerCase();
  const map = {
    'utf-8': 'UTF-8', 'utf8': 'UTF-8',
    'utf-16be': 'UTF-16BE', 'utf-16le': 'UTF-16LE',
    'iso-8859-1': 'windows-1252', 'latin1': 'windows-1252',
    'windows-1252': 'windows-1252',
  };
  return map[l] || null;
}

function normalizeEncoding(label) {
  return labelToName(label) || null;
}

function isomorphicDecode(bytes) {
  return String.fromCharCode(...bytes);
}

function isomorphicEncode(str) {
  const result = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++) result[i] = str.charCodeAt(i) & 0xff;
  return result;
}

function legacyHookDecode() {}

module.exports = {
  TextDecoder,
  TextEncoder,
  TextDecoderStream,
  TextEncoderStream,
  getBOMEncoding,
  labelToName,
  normalizeEncoding,
  isomorphicDecode,
  isomorphicEncode,
  legacyHookDecode,
};
