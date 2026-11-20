// Packages dist/index.js into dist/safi-analyze.zip using only Node built-ins (no zip tool required).
import { readFileSync, writeFileSync } from 'node:fs';
import { deflateRawSync } from 'node:zlib';

const name = 'index.js';
const data = readFileSync(new URL('../dist/index.js', import.meta.url));
const compressed = deflateRawSync(data, { level: 9 });

const crcTable = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
let crc = 0xffffffff;
for (const b of data) crc = crcTable[(crc ^ b) & 0xff] ^ (crc >>> 8);
crc = (crc ^ 0xffffffff) >>> 0;

const nameBuf = Buffer.from(name);
const dosTime = 0x0000;
const dosDate = 0x5821; // fixed date keeps the zip reproducible

const local = Buffer.alloc(30);
local.writeUInt32LE(0x04034b50, 0);
local.writeUInt16LE(20, 4);
local.writeUInt16LE(0, 6);
local.writeUInt16LE(8, 8);
local.writeUInt16LE(dosTime, 10);
local.writeUInt16LE(dosDate, 12);
local.writeUInt32LE(crc, 14);
local.writeUInt32LE(compressed.length, 18);
local.writeUInt32LE(data.length, 22);
local.writeUInt16LE(nameBuf.length, 26);
local.writeUInt16LE(0, 28);

const central = Buffer.alloc(46);
central.writeUInt32LE(0x02014b50, 0);
central.writeUInt16LE(20, 4);
central.writeUInt16LE(20, 6);
central.writeUInt16LE(0, 8);
central.writeUInt16LE(8, 10);
central.writeUInt16LE(dosTime, 12);
central.writeUInt16LE(dosDate, 14);
central.writeUInt32LE(crc, 16);
central.writeUInt32LE(compressed.length, 20);
central.writeUInt32LE(data.length, 24);
central.writeUInt16LE(nameBuf.length, 28);
central.writeUInt32LE(0, 38);
central.writeUInt32LE(0, 42);

const localPart = Buffer.concat([local, nameBuf, compressed]);
const centralPart = Buffer.concat([central, nameBuf]);

const end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0);
end.writeUInt16LE(1, 8);
end.writeUInt16LE(1, 10);
end.writeUInt32LE(centralPart.length, 12);
end.writeUInt32LE(localPart.length, 16);

const out = new URL('../dist/safi-analyze.zip', import.meta.url);
writeFileSync(out, Buffer.concat([localPart, centralPart, end]));
console.log(`wrote dist/safi-analyze.zip (${localPart.length + centralPart.length + end.length} bytes)`);
