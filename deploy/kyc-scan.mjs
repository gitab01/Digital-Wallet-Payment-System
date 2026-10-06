/*
 * A synthetic identity scan, and the multipart call that files one. Both smokes need it:
 * the API smoke to drive a submission through approval, and the browser smoke to leave a
 * real pair of images on the review desk.
 */
import { deflateSync } from 'node:zlib';

/**
 * A decodable greyscale PNG, built here rather than carried as base64 so its pixel
 * content can vary per call. The service re-encodes whatever it receives, so an image
 * it could not decode would fail the seed rather than the product.
 */
export function scanImage(width, height, seed) {
  const table = scanImage.table ??= (() => {
    const t = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let bit = 0; bit < 8; bit++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c;
    }
    return t;
  })();
  const crc = (buf) => {
    let c = 0xffffffff;
    for (const byte of buf) c = table[(c ^ byte) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type, data) => {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
    const sum = Buffer.alloc(4);
    sum.writeUInt32BE(crc(body));
    return Buffer.concat([length, body, sum]);
  };

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 0; // colour type: greyscale
  const stride = width + 1;
  const raw = Buffer.alloc(height * stride);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      raw[y * stride + 1 + x] = (x * 7 + y * 13 + seed * 31) & 0xff;
    }
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** Files one side of the caller's pending submission. Returns the stored document. */
export async function fileScan(api, token, side, seed) {
  const form = new FormData();
  form.append('side', side);
  form.append('file', new Blob([scanImage(640, 400, seed)], { type: 'image/png' }), 'scan.png');
  // No Content-Type on the request: fetch generates the multipart boundary, and a
  // hand-written header here would leave the server with parts it cannot split.
  const res = await fetch(`${api}/api/kyc/documents`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  const text = await res.text();
  if (res.status !== 201) throw new Error(`the ${side.toLowerCase()} scan was refused: ${res.status} ${text}`);
  return JSON.parse(text);
}
