import { Buffer } from 'buffer';
import { aesCmac } from 'node-aes-cmac';
import { decrypt, encrypt } from './crypto';

const generateMacKey = (randA: Buffer, randB: Buffer, authenticationKey: Buffer) => {
  const last2BytesOfA = randA.subarray(0, 2);

  const xOrRandA = randA.subarray(2, 8);
  const xOrRandB = randB.subarray(0, 6);

  const xOr = xOrRandA.map((b, i) => b ^ (xOrRandB[i] as number));

  const beginningOfA = randA.subarray(8);
  const beginningOfB = randB.subarray(6);

  const sv2 = Buffer.concat([
    Buffer.from([0x5a, 0xa5, 0x00, 0x01, 0x00, 0x80]),
    last2BytesOfA,
    xOr,
    beginningOfB,
    beginningOfA,
  ]);

  return aesCmac(authenticationKey, sv2, { returnAsBuffer: true });
};

const generateMac = (
  commandCode: number[],
  commandHeader: number[],
  commandData: number[],
  commandCounter: Buffer,
  transactionId: Buffer,
  sessionKey: Buffer
) => {
  const macData = Buffer.concat([
    Buffer.from(commandCode),
    commandCounter,
    transactionId,
    Buffer.from(commandHeader),
    Buffer.from(commandData),
  ]);

  const mac = aesCmac(Buffer.from(sessionKey), macData, { returnAsBuffer: true });

  return mac.filter((_, i) => i % 2 === 1);
};

const verifyMac = (responseData: number[], commandCounter: Buffer, transactionId: Buffer, sessionKey: Buffer) => {
  const data = responseData.slice(0, responseData.length - 10);
  const responseCode = responseData.slice(-2);
  const mac = responseData.slice(responseData.length - 10, responseData.length - 2);

  const macData = Buffer.concat([Buffer.from([responseCode[1]!]), commandCounter, transactionId, Buffer.from(data)]);

  const macCheck = aesCmac(Buffer.from(sessionKey), macData, {
    returnAsBuffer: true,
  }).filter((_, i) => i % 2 === 1);

  if (mac.toString() !== macCheck.toString()) throw new Error('Response mac verification failed');

  return [...data, ...mac, ...responseCode];
};

const generateEncKey = (randA: Buffer, randB: Buffer, authenticationKey: Buffer) => {
  const last2BytesOfA = randA.subarray(0, 2);

  const xOrRandA = randA.subarray(2, 8);
  const xOrRandB = randB.subarray(0, 6);

  const xOr = xOrRandA.map((b, i) => b ^ (xOrRandB[i] as number));

  const beginningOfA = randA.subarray(8);
  const beginningOfB = randB.subarray(6);

  const sv1 = Buffer.concat([
    Buffer.from([0xa5, 0x5a, 0x00, 0x01, 0x00, 0x80]),
    last2BytesOfA,
    xOr,
    beginningOfB,
    beginningOfA,
  ]);

  return aesCmac(authenticationKey, sv1, { returnAsBuffer: true });
};

const encryptPayload = (commandData: number[], transactionId: Buffer, commandCounter: Buffer, sessionKey: Buffer) => {
  const iv = encrypt(
    Buffer.concat([Buffer.from([0xa5, 0x5a]), transactionId, commandCounter, Buffer.alloc(8)]),
    Buffer.from([]),
    sessionKey,
    'aes-128-ecb'
  );

  const padding = 16 - (commandData.length % 16);

  let commandDataWithPadding;
  if (padding === 1) {
    commandDataWithPadding = Buffer.concat([Buffer.from(commandData), Buffer.from([0x80])]);
  } else {
    commandDataWithPadding = Buffer.concat([Buffer.from(commandData), Buffer.from([0x80]), Buffer.alloc(padding - 1)]);
  }

  const encryptedData = encrypt(commandDataWithPadding, iv, sessionKey, 'aes-128-cbc');

  return [...encryptedData];
};

const decryptPayload = (responseData: number[], transactionId: Buffer, commandCounter: Buffer, sessionKey: Buffer) => {
  const data = responseData.slice(0, responseData.length - 10);
  const responseCode = responseData.slice(-2);
  const mac = responseData.slice(responseData.length - 10, responseData.length - 2);

  const decryptionIv = encrypt(
    Buffer.concat([Buffer.from([0x5a, 0xa5]), transactionId, commandCounter, Buffer.alloc(8)]),
    Buffer.from([]),
    sessionKey,
    'aes-128-ecb'
  );

  const decrypted = decrypt(Buffer.from(data), decryptionIv, sessionKey, 'aes-128-cbc');

  return [...decrypted, ...mac, ...responseCode];
};

export { generateMacKey, generateMac, verifyMac, generateEncKey, encryptPayload, decryptPayload };
