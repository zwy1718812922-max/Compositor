// PNG pHYs uses pixels/metre; JPEG JFIF stores an integer pixels/inch density.
const table = Array.from({ length: 256 }, (_, value) => {
  let crc = value;
  for (let i = 0; i < 8; i++) crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  return crc >>> 0;
});
function chunk(type, data) {
  const out = Buffer.alloc(data.length + 12);
  out.writeUInt32BE(data.length, 0); out.write(type, 4, 'ascii'); data.copy(out, 8);
  let crc = 0xffffffff;
  for (const byte of out.subarray(4, data.length + 8)) crc = table[(crc ^ byte) & 255] ^ (crc >>> 8);
  out.writeUInt32BE((crc ^ 0xffffffff) >>> 0, data.length + 8);
  return out;
}
function setImageResolution(input, format, resolution) {
  if (!Number.isFinite(resolution) || resolution < 1 || resolution > 9600) throw new Error('导出分辨率无效。');
  if (format === 'jpeg') {
    if (input.length < 20 || input.readUInt16BE(0) !== 0xffd8) throw new Error('JPEG 数据无效。');
    if (input.readUInt16BE(2) === 0xffe0 && input.subarray(6, 11).toString('ascii') === 'JFIF\0') {
      const result = Buffer.from(input); result[13] = 1;
      result.writeUInt16BE(Math.round(resolution), 14); result.writeUInt16BE(Math.round(resolution), 16);
      return result;
    }
    const header = Buffer.from('ffe000104a46494600010101000100010000', 'hex');
    header.writeUInt16BE(Math.round(resolution), 12); header.writeUInt16BE(Math.round(resolution), 14);
    return Buffer.concat([input.subarray(0, 2), header, input.subarray(2)]);
  }
  if (format !== 'png' || input.length < 20 || input.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') throw new Error('PNG 数据无效。');
  const physical = Buffer.alloc(9), perMetre = Math.round(resolution / .0254);
  physical.writeUInt32BE(perMetre, 0); physical.writeUInt32BE(perMetre, 4); physical[8] = 1;
  const parts = [input.subarray(0, 8)]; let inserted = false;
  for (let offset = 8; offset < input.length;) {
    if (offset + 12 > input.length) throw new Error('PNG 数据不完整。');
    const end = offset + input.readUInt32BE(offset) + 12;
    if (end > input.length) throw new Error('PNG 数据不完整。');
    const type = input.subarray(offset + 4, offset + 8).toString('ascii');
    if (type === 'IDAT' && !inserted) { parts.push(chunk('pHYs', physical)); inserted = true; }
    if (type !== 'pHYs') parts.push(input.subarray(offset, end));
    offset = end;
  }
  if (!inserted) throw new Error('PNG 缺少像素数据。');
  return Buffer.concat(parts);
}
module.exports = { setImageResolution };
