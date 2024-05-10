import { Buffer } from 'buffer';
import { aesCmac } from 'node-aes-cmac';

export function sessionKeyEncryption(randA: Buffer, randB: Buffer, authenticationKey: Buffer) {
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
}

export function sessionKeyMac(randA: Buffer, randB: Buffer, authenticationKey: Buffer) {
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
}
