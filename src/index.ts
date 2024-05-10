import { Buffer } from 'buffer';
import { type NfcManager as NfcManagerType } from './types/nfc-manager';
import { NfcTech } from 'react-native-nfc-manager';
import type { CommandOptions, SelectFileOption, ReadWriteFileOption } from './types/types';
import { aesCbcEncrypt, aesEcbEncrypt, aesCbcDecrypt, crc32, getBits } from './utils/crypto';
import crypto from 'react-native-quick-crypto';
import { sessionKeyEncryption, sessionKeyMac } from './utils/sessionKeys';
import { aesCmac } from 'node-aes-cmac';
import { NtagError } from './utils/error';

class Ntag424 {
  private readonly nfcManager: NfcManagerType;
  private isAuthenticated: boolean;
  private authenticatedKeySlot?: number;
  private sessionKeyEncryption?: Buffer;
  private sessionKeyMac?: Buffer;
  private transactionId?: Buffer;
  private commandCounter?: Buffer;

  constructor(nfcManager: NfcManagerType) {
    this.nfcManager = nfcManager;
    this.isAuthenticated = false;
  }

  public async initialize() {
    await this.nfcManager.requestTechnology(NfcTech.IsoDep);
  }

  public async terminate() {
    await this.nfcManager.cancelTechnologyRequest();
  }

  public async selectFile(file: SelectFileOption) {
    const adpuHeader = [0x00, 0xa4, 0x00, 0x0c];
    const commandHeader = [] as number[];
    const commandData = [];

    if (file === 'master') commandData.push(0x3f, 0x00);
    else if (file === 'application') commandData.push(0xe1, 0x10);
    else if (file === 'cc') commandData.push(0xe1, 0x03);
    else if (file === 'ndef') commandData.push(0xe1, 0x04);
    else if (file === 'proprietary') commandData.push(0xe1, 0x05);
    else throw new Error('Invalid file selected');

    if (file === 'cc' || file === 'ndef' || file === 'proprietary')
      await this.selectFile('application');

    const response = await this.sendCommand({
      adpuHeader,
      commandHeader,
      commandData,
      commandMode: 'plain',
      includeLe: true,
    });

    return response;
  }

  public async getCardUid() {
    const adpuHeader = [0x90, 0x51, 0x00, 0x00];

    const response = await this.sendCommand({
      adpuHeader,
      commandHeader: [],
      commandData: [],
      commandMode: 'mac',
      includeLe: true,
    });

    const decrypted = this.decryptPayload(response);

    return decrypted;
  }

  public async getFileSettings(file: ReadWriteFileOption) {
    const adpuHeader = [0x90, 0xf5, 0x00, 0x00];

    let fileNo;
    if (file === 'cc') fileNo = 0x01;
    else if (file === 'ndef') fileNo = 0x02;
    else if (file === 'proprietary') fileNo = 0x03;
    else throw new Error('Invalid file type');

    const commandHeader = [fileNo];

    const response = await this.sendCommand({
      adpuHeader,
      commandHeader,
      commandData: [],
      commandMode: 'mac',
      includeLe: true,
    });

    return response;
  }

  public async changeFileSettings(file: ReadWriteFileOption, fileSettings: Buffer) {
    const adpuHeader = [0x90, 0x5f, 0x00, 0x00];

    let fileNo;
    if (file === 'cc') fileNo = 0x01;
    else if (file === 'ndef') fileNo = 0x02;
    else if (file === 'proprietary') fileNo = 0x03;
    else throw new Error('Invalid file type');

    const commandHeader = [fileNo];
    const commandData = [...fileSettings];

    const response = await this.sendCommand({
      adpuHeader,
      commandHeader,
      commandData,
      commandMode: 'full',
      includeLe: true,
    });

    return response;
  }

  public async readData(file: ReadWriteFileOption, offset = 0, length = 0) {
    const adpuHeader = [0x90, 0xad, 0x00, 0x00];

    if (offset > 255 || length > 255) throw new Error('Length and offset must be below 256');

    let fileNo;

    if (file === 'cc') fileNo = 0x01;
    else if (file === 'ndef') fileNo = 0x02;
    else if (file === 'proprietary') fileNo = 0x03;
    else throw new Error('Invalid file type');

    const commandHeader = [fileNo, offset, 0x00, 0x00, length, 0x00, 0x00];

    const fileSettings = await this.getFileSettings(file);
    const commandModeBits = getBits(fileSettings[1]!, 0, 1);
    const commandMode = commandModeBits === 3 ? 'full' : commandModeBits === 1 ? 'mac' : 'plain';

    const response = await this.sendCommand({
      adpuHeader,
      commandHeader,
      commandData: [],
      commandMode,
      includeLe: true,
    });

    return response;
  }

  public async writeData(file: ReadWriteFileOption, data: Buffer, offset = 0) {
    if (data.length > 248) throw new Error('Data buffer can contain 248 bytes at most');

    const adpuHeader = [0x90, 0x8d, 0x00, 0x00];

    let commandData;
    let fileNo;

    const payloadLength = offset + data.length;
    if (file === 'cc') {
      if (payloadLength > 32) throw new Error('The cc file cannot exceed 32 bytes');
      fileNo = 0x01;
      commandData = Buffer.concat([data, Buffer.alloc(32 - payloadLength)]);
    } else if (file === 'ndef') {
      if (payloadLength > 256) throw new Error('The ndef file cannot exceed 256 bytes');
      fileNo = 0x02;
      commandData = Buffer.concat([data, Buffer.alloc(248 - payloadLength)]);
    } else if (file === 'proprietary') {
      if (payloadLength > 128) throw new Error('The proprietary file cannot exceed 128 bytes');
      fileNo = 0x03;
      commandData = Buffer.concat([data, Buffer.alloc(128 - payloadLength)]);
    } else throw new Error('Invalid file type');

    const commandHeader = [fileNo, offset, 0x00, 0x00, commandData.length, 0x00, 0x00];

    const fileSettings = await this.getFileSettings(file);
    const commandModeBits = getBits(fileSettings[1]!, 0, 1);
    const commandMode = commandModeBits === 3 ? 'full' : commandModeBits === 1 ? 'mac' : 'plain';

    const response = await this.sendCommand({
      adpuHeader,
      commandHeader,
      commandData: [...commandData],
      commandMode,
      includeLe: true,
    });

    return response;
  }

  public async changeMasterKey(newKey: Buffer) {
    const adpuHeader = [0x90, 0xc4, 0x00, 0x00];
    const commandHeader = [0x00];

    const currentKeyVersion = await this.getKeyVersion(0x00);
    const commandData = [...newKey, currentKeyVersion + 1];

    const response = await this.sendCommand({
      adpuHeader,
      commandHeader,
      commandData,
      commandMode: 'full',
      includeLe: true,
    });

    return response;
  }

  public async changeApplicationKey(keySlot: number, oldKey: Buffer, newKey: Buffer) {
    const adpuHeader = [0x90, 0xc4, 0x00, 0x00];
    const commandHeader = [keySlot];

    const currentKeyVersion = await this.getKeyVersion(keySlot);

    const xorBuffer = oldKey.map((b, i) => b ^ (newKey[i] as number));
    const crc = crc32(newKey);

    const commandData = [...xorBuffer, currentKeyVersion, ...crc];

    const response = await this.sendCommand({
      adpuHeader,
      commandHeader,
      commandData,
      commandMode: 'full',
      includeLe: true,
    });

    return response;
  }

  public async getKeyVersion(keySlot: number) {
    const adpuHeader = [0x90, 0x64, 0x00, 0x00];
    const commandHeader = [keySlot];
    const commandData = [] as number[];

    const response = await this.sendCommand({
      adpuHeader,
      commandHeader,
      commandData,
      commandMode: 'mac',
      includeLe: true,
    });

    return response[0] as number;
  }

  public async authenticateEv2First(keySlot: number, key: Buffer) {
    const partOne = await this.authenticateEv2FirstPartOne(keySlot);

    const randB = aesCbcDecrypt(partOne.subarray(0, 16), Buffer.alloc(16), key);
    const randA = Buffer.from(crypto.randomBytes(16));

    const randBRotatedLeft = Buffer.concat([randB.subarray(1), randB.subarray(0, 1)]);

    const { encrypted } = aesCbcEncrypt(
      Buffer.concat([randA, Buffer.from(randBRotatedLeft)]),
      Buffer.alloc(16),
      key
    );

    const partTwoEncrypted = await this.aesAuthenticateEv2FirstPartTwo(encrypted);

    const partTwo = aesCbcDecrypt(partTwoEncrypted.subarray(0, 32), Buffer.alloc(16), key);

    this.isAuthenticated = true;
    this.authenticatedKeySlot = keySlot;
    this.transactionId = partTwo.subarray(0, 4);
    this.commandCounter = Buffer.alloc(2);
    this.sessionKeyEncryption = sessionKeyEncryption(randA, randB, key);
    this.sessionKeyMac = sessionKeyMac(randA, randB, key);

    return [0x91, 0x00];
  }

  public async authenticateEv2NonFirst(keySlot: number, key: Buffer) {
    if (!this.authenticatedKeySlot)
      throw new Error(`Must authenticateFirst before using authenticateNonFirst`);

    const partOne = await this.authenticateEv2NonFirstPartOne(keySlot);

    const randB = aesCbcDecrypt(partOne.subarray(0, 16), Buffer.alloc(16), key);
    const randA = Buffer.from(crypto.randomBytes(16));

    const randBRotatedLeft = Buffer.concat([randB.subarray(1), randB.subarray(0, 1)]);

    const { encrypted } = aesCbcEncrypt(
      Buffer.concat([randA, Buffer.from(randBRotatedLeft)]),
      Buffer.alloc(16),
      key
    );

    await this.aesAuthenticateEv2NonFirstPartTwo(encrypted);

    this.sessionKeyEncryption = sessionKeyEncryption(randA, randB, key);
    this.sessionKeyMac = sessionKeyMac(randA, randB, key);

    return [0x91, 0x00];
  }

  private async authenticateEv2NonFirstPartOne(keySlot: number) {
    const adpuHeader = [0x90, 0x77, 0x00, 0x00];
    const commandHeader = [keySlot];
    const commandData = [] as number[];

    const response = await this.sendCommand({
      adpuHeader,
      commandHeader,
      commandData,
      commandMode: 'plain',
      includeLe: true,
    });

    return Buffer.from(response);
  }

  private async aesAuthenticateEv2NonFirstPartTwo(data: Buffer) {
    const adpuHeader = [0x90, 0xaf, 0x00, 0x00];
    const commandHeader = [] as number[];
    const commandData = [...data];

    const response = await this.sendCommand({
      adpuHeader,
      commandHeader,
      commandData,
      commandMode: 'plain',
      includeLe: true,
    });

    return Buffer.from(response);
  }

  private async authenticateEv2FirstPartOne(keySlot: number) {
    const adpuHeader = [0x90, 0x71, 0x00, 0x00];
    const commandHeader = [keySlot, 0x03, 0x00, 0x00, 0x00];
    const commandData = [] as number[];

    const response = await this.sendCommand({
      adpuHeader,
      commandHeader,
      commandData,
      commandMode: 'plain',
      includeLe: true,
    });

    return Buffer.from(response);
  }

  private async aesAuthenticateEv2FirstPartTwo(data: Buffer) {
    const adpuHeader = [0x90, 0xaf, 0x00, 0x00];
    const commandHeader = [] as number[];
    const commandData = [...data];

    const response = await this.sendCommand({
      adpuHeader,
      commandHeader,
      commandData,
      commandMode: 'plain',
      includeLe: true,
    });

    return Buffer.from(response);
  }

  private generateMac(commandCode: number[], commandHeader: number[], commandData: number[]) {
    const macData = Buffer.concat([
      Buffer.from(commandCode),
      this.commandCounter!,
      this.transactionId!,
      Buffer.from(commandHeader),
      Buffer.from(commandData),
    ]);

    const mac = aesCmac(Buffer.from(this.sessionKeyMac!), macData, { returnAsBuffer: true });

    return mac.filter((_, i) => i % 2 === 1);
  }

  private verifyMac(response: number[]) {
    const data = response.slice(0, response.length - 10);
    const responseCode = response.slice(-2);
    const mac = response.slice(response.length - 10, response.length - 2);

    const macData = Buffer.concat([
      Buffer.from([responseCode[1]!]),
      this.commandCounter!,
      this.transactionId!,
      Buffer.from(data),
    ]);

    const macCheck = aesCmac(Buffer.from(this.sessionKeyMac!), macData, {
      returnAsBuffer: true,
    }).filter((_, i) => i % 2 === 1);

    if (mac.toString() !== macCheck.toString()) throw new Error('Response mac verification failed');

    return [...data, ...mac, ...responseCode];
  }

  private encryptPayload(commandData: number[]) {
    const { encrypted: iv } = aesEcbEncrypt(
      Buffer.concat([
        Buffer.from([0xa5, 0x5a]),
        this.transactionId!,
        this.commandCounter!,
        Buffer.alloc(8),
      ]),
      Buffer.from([]),
      this.sessionKeyEncryption!
    );

    const padding = 16 - (commandData.length % 16);

    let commandDataWithPadding;
    if (padding === 1) {
      commandDataWithPadding = Buffer.concat([Buffer.from(commandData), Buffer.from([0x80])]);
    } else {
      commandDataWithPadding = Buffer.concat([
        Buffer.from(commandData),
        Buffer.from([0x80]),
        Buffer.alloc(padding - 1),
      ]);
    }

    const { encrypted: encryptedData } = aesCbcEncrypt(
      commandDataWithPadding,
      iv,
      this.sessionKeyEncryption!
    );

    return [...encryptedData];
  }

  private decryptPayload(response: number[]) {
    const data = response.slice(0, response.length - 10);
    const responseCode = response.slice(-2);
    const mac = response.slice(response.length - 10, response.length - 2);

    const { encrypted: decryptionIv } = aesEcbEncrypt(
      Buffer.concat([
        Buffer.from([0x5a, 0xa5]),
        this.transactionId!,
        this.commandCounter!,
        Buffer.alloc(8),
      ]),
      Buffer.from([]),
      this.sessionKeyEncryption!
    );

    const decrypted = aesCbcDecrypt(Buffer.from(data), decryptionIv, this.sessionKeyEncryption!);

    return [...decrypted, ...mac, ...responseCode];
  }

  private incrementCommandCounter() {
    if (!this.commandCounter) return;
    else if (this.commandCounter[0]! < 0xff) this.commandCounter[0] += 1;
    else this.commandCounter[1] += 1;
  }

  private async sendCommand({
    adpuHeader,
    commandHeader,
    commandData,
    commandMode,
    includeLe,
  }: CommandOptions) {
    if (commandMode === 'plain') {
      const length = commandHeader.length + commandData.length;
      const payload = [
        ...adpuHeader,
        ...(length > 0 ? [length] : []),
        ...commandHeader,
        ...commandData,
        ...(includeLe ? [0x00] : []),
      ];

      const response = await this.nfcManager.isoDepHandler.transceive(payload);

      if (response[response.length - 1] !== 0x00 && response[response.length - 1] !== 0xaf)
        throw new NtagError(adpuHeader.slice(0, 2), response.slice(-2));

      this.incrementCommandCounter();

      return response;
    }

    if (commandMode === 'mac') {
      if (!this.isAuthenticated) {
        throw new Error('Please authenticate first to use this command');
      }

      const mac = this.generateMac(adpuHeader.slice(1, 2), commandHeader, commandData);

      const length = commandHeader.length + commandData.length + mac.length;

      const payload = [
        ...adpuHeader,
        ...(length > 0 ? [length] : []),
        ...commandHeader,
        ...commandData,
        ...mac,
        ...(includeLe ? [0x00] : []),
      ];

      const response = await this.nfcManager.isoDepHandler.transceive(payload);

      if (response[response.length - 1] !== 0x00)
        throw new NtagError(adpuHeader.slice(0, 2), response.slice(-2));

      this.incrementCommandCounter();

      return this.verifyMac(response);
    }

    if (commandMode === 'full') {
      if (!this.isAuthenticated) {
        throw new Error('Please authenticate first to use this command');
      }

      const encryptedData = this.encryptPayload(commandData);

      const mac = this.generateMac(adpuHeader.slice(1, 2), commandHeader, encryptedData);

      const length = encryptedData.length + commandHeader.length + mac.length;

      const payload = [
        ...adpuHeader,
        ...(length > 0 ? [length] : []),
        ...commandHeader,
        ...encryptedData,
        ...mac,
        ...(includeLe ? [0x00] : []),
      ];

      const response = await this.nfcManager.isoDepHandler.transceive(payload);

      if (response[response.length - 1] !== 0x00)
        throw new NtagError(adpuHeader.slice(0, 2), response.slice(-2));

      this.incrementCommandCounter();

      const decryptedResponse = this.decryptPayload(response);

      return this.verifyMac(decryptedResponse);
    }

    throw new Error('Invalid command mode');
  }
}

export default Ntag424;
