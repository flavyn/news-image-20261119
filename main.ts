import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

function jpegDimensions(bytes: Buffer): [number, number] {
  let offset = 2;
  while (offset < bytes.length) {
    if (bytes[offset++] !== 0xff) throw new Error('Invalid JPEG segment marker');
    while (offset < bytes.length && bytes[offset] === 0xff) offset++;
    if (offset >= bytes.length) break;
    const marker = bytes[offset++];
    if (marker === 0xda || marker === 0xd9) break;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (offset + 2 > bytes.length) throw new Error('Truncated JPEG segment');
    const length = bytes.readUInt16BE(offset);
    if (length < 2 || offset + length > bytes.length) throw new Error('Invalid JPEG segment length');
    const isFrame = marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker);
    if (isFrame) {
      if (length < 8) throw new Error('Truncated JPEG frame');
      return [bytes.readUInt16BE(offset + 5), bytes.readUInt16BE(offset + 3)];
    }
    offset += length;
  }
  throw new Error('JPEG dimensions not found');
}

try {
  const sourceName = process.argv[2] ?? 'entry.png';
  if (sourceName !== 'entry.png' || process.argv.length > 3) {
    throw new Error('Source name must be entry.png');
  }
  const source = resolve(dirname(fileURLToPath(import.meta.url)), sourceName);
  const outputDir = resolve(process.env.MAKEFUN_OUTPUT_DIR ?? '/output');
  mkdirSync(outputDir, { recursive: true });
  if (!existsSync(source)) throw new Error('Source entry.png does not exist');

  let bytes: Buffer;
  try {
    bytes = readFileSync(source);
  } catch (error) {
    throw new Error(`Cannot read source entry.png: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (bytes.length === 0) throw new Error('Source entry.png is empty');
  if (bytes.length > 1048576) throw new Error('Source exceeds 1048576 bytes');
  const isPng = bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const isJpeg = bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xd8;
  if (!isPng && !isJpeg) throw new Error('Source must be PNG or JPEG');

  let width: number;
  let height: number;
  if (isPng) {
    if (bytes.length < 33 || bytes.readUInt32BE(8) !== 13 || bytes.toString('ascii', 12, 16) !== 'IHDR') {
      throw new Error('PNG has a missing or truncated IHDR chunk');
    }
    width = bytes.readUInt32BE(16);
    height = bytes.readUInt32BE(20);
  } else {
    [width, height] = jpegDimensions(bytes);
  }
  if (width === 0 || height === 0 || width > 1024 || height > 1024) {
    throw new Error('Image dimensions must be between 1 and 1024 pixels');
  }

  const destination = resolve(outputDir, 'entry.png');
  writeFileSync(destination, bytes);
  console.log(`Wrote ${destination} (${bytes.length} bytes)`);
} catch (error) {
  console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
