import crypto from 'crypto';
import { Buffer } from 'buffer';

type DecryptionSchemes = 'aes-128-cbc';
type EncryptionSchemes = 'aes-128-cbc' | 'aes-128-ecb';

const encrypt = (data: Buffer, iv: Buffer, key: Buffer, scheme: EncryptionSchemes) => {
  const cipher = crypto.createCipheriv(scheme, key, iv);
  const encrypted = cipher.update(data) as Buffer;
  cipher.final();

  return encrypted;
};

const decrypt = (data: Buffer, iv: Buffer, key: Buffer, scheme: DecryptionSchemes) => {
  const decipher = crypto.createDecipheriv(scheme, key, iv);

  decipher.setAutoPadding(false);

  return Buffer.concat([decipher.update(data) as Buffer, decipher.final() as Buffer]);
};

const crc32 = (data: Buffer) => {
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
};

export { encrypt, decrypt, crc32 };
