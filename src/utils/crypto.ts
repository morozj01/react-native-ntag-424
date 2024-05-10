import crypto from 'react-native-quick-crypto';
import { Buffer } from 'buffer';

export function aesCbcEncrypt(data: Buffer, iv: Buffer, key: Buffer) {
  const cipher = crypto.createCipheriv('aes-128-cbc', key, iv);
  const encrypted = cipher.update(data) as Buffer;
  const final = cipher.final() as Buffer;

  return { encrypted, final };
}

export function aesCbcDecrypt(data: Buffer, iv: Buffer, key: Buffer) {
  const decipher = crypto.createDecipheriv('aes-128-cbc', key, iv);

  decipher.setAutoPadding(false);

  return Buffer.concat([decipher.update(data) as Buffer, decipher.final() as Buffer]);
}

export function aesEcbEncrypt(data: Buffer, iv: Buffer, key: Buffer) {
  const cipher = crypto.createCipheriv('aes-128-ecb', key, iv);
  const encrypted = cipher.update(data) as Buffer;
  const final = cipher.final() as Buffer;

  return { encrypted, final };
}

export function getBits(number: number, start: number, end: number) {
  if (start > end || start < 0 || end < 0) {
    throw new Error('Invalid start or end index');
  }

  const mask = ((1 << (end - start + 1)) - 1) << start;

  return (number & mask) >> start;
}

export function crc32(data: Buffer) {
  let c;
  const crcTable: number[] = [];

  for (let n = 0; n < 256; n++) {
    c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }

    crcTable[n] = c;
  }

  let crc = 0 ^ -1;

  for (let i = 0; i < data.length; i++) {
    crc = (crc >>> 8) ^ (crcTable[(crc ^ (data[i] as number)) & 0xff] as number);
  }

  crc = (crc ^ -1) >>> 0;

  const result = Buffer.alloc(4);
  result.writeUInt32LE(crc, 0);

  return result.map((byte) => ~byte);
}
