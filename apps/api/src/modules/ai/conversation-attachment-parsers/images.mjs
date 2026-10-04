import { crc32 } from 'node:zlib';
import { ATTACHMENT_PARSE_LIMITS, parseError, unsupported } from './limits.mjs';
function dimensions(width, height) {
  if (!width || !height || width > ATTACHMENT_PARSE_LIMITS.imageDimension || height > ATTACHMENT_PARSE_LIMITS.imageDimension
    || width * height > ATTACHMENT_PARSE_LIMITS.imagePixels) throw parseError('AI_ATTACHMENT_IMAGE_LIMIT');
  return unsupported('image', 'AI_ATTACHMENT_VISION_UNSUPPORTED', { width, height });
}
function png(buffer) {
  let offset = 8, width, height, data = false, ended = false, chunks = 0;
  while (offset + 12 <= buffer.length) {
    if (++chunks > 10000) throw parseError('AI_ATTACHMENT_IMAGE_INVALID');
    const length = buffer.readUInt32BE(offset), type = buffer.toString('ascii', offset + 4, offset + 8);
    if (length > buffer.length - offset - 12 || !/^[A-Za-z]{4}$/.test(type)) throw parseError('AI_ATTACHMENT_IMAGE_INVALID');
    if (crc32(buffer.subarray(offset + 4, offset + 8 + length)) !== buffer.readUInt32BE(offset + 8 + length)) throw parseError('AI_ATTACHMENT_IMAGE_INVALID');
    if (chunks === 1) {
      if (type !== 'IHDR' || length !== 13) throw parseError('AI_ATTACHMENT_IMAGE_INVALID');
      width = buffer.readUInt32BE(offset + 8); height = buffer.readUInt32BE(offset + 12);
      dimensions(width, height);
      const depth = buffer[offset + 16], color = buffer[offset + 17];
      const depths = { 0: [1, 2, 4, 8, 16], 2: [8, 16], 3: [1, 2, 4, 8], 4: [8, 16], 6: [8, 16] };
      if (!depths[color]?.includes(depth) || buffer[offset + 18] !== 0 || buffer[offset + 19] !== 0 || buffer[offset + 20] > 1) throw parseError('AI_ATTACHMENT_IMAGE_INVALID');
    } else if (type === 'IHDR') throw parseError('AI_ATTACHMENT_IMAGE_INVALID');
    if (type === 'IDAT' && length > 0) data = true;
    offset += length + 12;
    if (type === 'IEND') {
      if (length !== 0 || !data || offset !== buffer.length) throw parseError('AI_ATTACHMENT_IMAGE_INVALID');
      ended = true; break;
    }
  }
  if (!ended) throw parseError('AI_ATTACHMENT_IMAGE_INVALID');
  return dimensions(width, height);
}
function jpeg(buffer) {
  let offset = 2, width, height, scan = false, ended = false, markers = 0;
  while (offset < buffer.length) {
    if (++markers > 10000 || buffer[offset++] !== 0xff) throw parseError('AI_ATTACHMENT_IMAGE_INVALID');
    while (buffer[offset] === 0xff) offset++;
    const marker = buffer[offset++];
    if (marker === 0xd9) { ended = offset === buffer.length; break; }
    if (marker === 0x00 || marker === 0xd8 || marker >= 0xd0 && marker <= 0xd7) throw parseError('AI_ATTACHMENT_IMAGE_INVALID');
    if (offset + 2 > buffer.length) throw parseError('AI_ATTACHMENT_IMAGE_INVALID');
    const length = buffer.readUInt16BE(offset);
    if (length < 2 || offset + length > buffer.length) throw parseError('AI_ATTACHMENT_IMAGE_INVALID');
    if ([0xc0, 0xc1, 0xc2].includes(marker)) {
      if (length < 11 || ![8, 12].includes(buffer[offset + 2]) || width !== undefined) throw parseError('AI_ATTACHMENT_IMAGE_INVALID');
      height = buffer.readUInt16BE(offset + 3); width = buffer.readUInt16BE(offset + 5);
      if (buffer[offset + 7] < 1 || buffer[offset + 7] > 4 || length !== 8 + 3 * buffer[offset + 7]) throw parseError('AI_ATTACHMENT_IMAGE_INVALID');
      dimensions(width, height);
    }
    offset += length;
    if (marker === 0xda) {
      scan = true;
      while (offset < buffer.length) {
        if (buffer[offset] !== 0xff) { offset++; continue; }
        if (buffer[offset + 1] === 0x00 || buffer[offset + 1] >= 0xd0 && buffer[offset + 1] <= 0xd7) { offset += 2; continue; }
        break;
      }
    }
  }
  if (!ended || !scan || width === undefined) throw parseError('AI_ATTACHMENT_IMAGE_INVALID');
  return dimensions(width, height);
}
export function validateImage(buffer, extension) { return extension === '.png' ? png(buffer) : jpeg(buffer); }
