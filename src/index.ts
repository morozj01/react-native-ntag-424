import { Buffer } from 'buffer';
import { type NfcManager as NfcManagerType } from './types/nfc-manager';
import { NfcTech } from 'react-native-nfc-manager';
import type { CommandOptions, SelectFileOption, ReadWriteFileOption } from './types/types';
import { encrypt, decrypt, crc32 } from './services/crypto';
import { getBits } from './services/utils';
import crypto from 'crypto';
import {
  decryptPayload,
  encryptPayload,
  generateEncKey,
  generateMac,
  generateMacKey,
  verifyMac,
} from './services/ntag424';
import { NtagError } from './services/errors';

class Ntag424 {
  private readonly nfcManager: NfcManagerType;
  private isAuthenticated: boolean;
  private sessionKeyEncryption?: Buffer;
  private sessionKeyMac?: Buffer;
  private transactionId?: Buffer;
  private commandCounter?: Buffer;

  constructor(nfcManager: NfcManagerType) {
    this.nfcManager = nfcManager;
    this.isAuthenticated = false;
  }

  /**
   * Begin an NFC scan and wait wait for an NFC card to be detected.
   */
  public async initiate() {
    await this.nfcManager.requestTechnology(NfcTech.IsoDep);
  }

  /**
   * End the currently active NFC scan.
   */
  public async terminate() {
    await this.nfcManager.cancelTechnologyRequest();
  }

  /**
   * Selects either the PICC level, the application or a file within the application.
   * {@link https://www.nxp.com/docs/en/data-sheet/NT4H2421Gx.pdf#page=77&zoom=100,200,220}
   * @param file file to select
   * @returns response code
   */
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

    if (file === 'cc' || file === 'ndef' || file === 'proprietary') await this.selectFile('application');

    const response = await this.sendCommand({
      adpuHeader,
      commandHeader,
      commandData,
      commandMode: 'plain',
      includeLe: true,
    });

    return response;
  }

  /**
   * Get the 7-byte UID from the chip. An authentication with any key slot needs to be performed prior to this function.
   * {@link https://www.nxp.com/docs/en/data-sheet/NT4H2421Gx.pdf#page=61&zoom=100,200,154}
   * @returns response data + response code
   */
  public async getCardUid() {
    const adpuHeader = [0x90, 0x51, 0x00, 0x00];

    const response = await this.sendCommand({
      adpuHeader,
      commandHeader: [],
      commandData: [],
      commandMode: 'mac',
      includeLe: true,
    });

    const decrypted = decryptPayload(response, this.transactionId!, this.commandCounter!, this.sessionKeyEncryption!);

    return decrypted;
  }

  /**
   * Get configuration properties of a specific file.
   * {@link https://www.nxp.com/docs/en/data-sheet/NT4H2421Gx.pdf#page=69&zoom=100,200,606}
   * @param file file to retrieve
   * @returns response data + response code
   */
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

  /**
   * Change the access parameters of an existing file.
   * {@link https://www.nxp.com/docs/en/data-sheet/NT4H2421Gx.pdf#page=65&zoom=100,200,220}
   * @param file file to update
   * @param fileSettings see data sheet for input structure
   * @returns response code
   */
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

  /**
   * Read data from one of the application data files.
   * {@link https://www.nxp.com/docs/en/data-sheet/NT4H2421Gx.pdf#page=73&zoom=100,200,220}
   * @param file file to read from
   * @param length number of bytes to read
   * @param offset byte at which to start reading
   * @returns response data + response code
   */
  public async readData(file: ReadWriteFileOption, length = 0, offset = 0) {
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

  /**
   * Write data to one of the application data files.
   * {@link https://www.nxp.com/docs/en/data-sheet/NT4H2421Gx.pdf#page=75&zoom=100,200,154}
   * @param file file to write to
   * @param data data to write
   * @param offset byte at which to begin writing
   * @returns response code
   */
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

  /**
   * Change key slot #0. Must be authenticated with key slot #0.
   * {@link https://www.nxp.com/docs/en/data-sheet/NT4H2421Gx.pdf#page=62&zoom=100,200,220}
   * @param newKey updated (16 byte) key data
   * @returns response code
   */
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

  /**
   * Change key slot #1-4. Must be authenticated with key slot #0.
   * {@link https://www.nxp.com/docs/en/data-sheet/NT4H2421Gx.pdf#page=62&zoom=100,200,220}
   * @param keySlot key slot to change where 1<=keySlot<=4
   * @param oldKey current (16 byte) key data
   * @param newKey new (16 byte) key data
   * @returns response code
   */
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

  /**
   * Retrieve the current key version of any key.
   * {@link https://www.nxp.com/docs/en/data-sheet/NT4H2421Gx.pdf#page=64&zoom=100,200,154}
   * @param keySlot key slot # to retrieve
   * @returns response data + response code
   */
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

  /**
   * Initiate an authentication based on standard AES.
   * {@link https://www.nxp.com/docs/en/data-sheet/NT4H2421Gx.pdf#page=46&zoom=100,200,292}
   * @param keySlot key slot # to authenticate into
   * @param key 16 byte key data
   * @returns response code
   */
  public async authenticateEv2First(keySlot: number, key: Buffer) {
    const partOne = await this.authenticateEv2FirstPartOne(keySlot);

    const randB = decrypt(partOne.subarray(0, 16), Buffer.alloc(16), key, 'aes-128-cbc');
    const randA = Buffer.from(crypto.randomBytes(16));

    const randBRotatedLeft = Buffer.concat([randB.subarray(1), randB.subarray(0, 1)]);

    const encrypted = encrypt(
      Buffer.concat([randA, Buffer.from(randBRotatedLeft)]),
      Buffer.alloc(16),
      key,
      'aes-128-cbc'
    );

    const partTwoEncrypted = await this.aesAuthenticateEv2FirstPartTwo(encrypted);

    const partTwo = decrypt(partTwoEncrypted.subarray(0, 32), Buffer.alloc(16), key, 'aes-128-cbc');

    this.isAuthenticated = true;
    this.transactionId = partTwo.subarray(0, 4);
    this.commandCounter = Buffer.alloc(2);
    this.sessionKeyEncryption = generateEncKey(randA, randB, key);
    this.sessionKeyMac = generateMacKey(randA, randB, key);

    return [0x91, 0x00];
  }

  /**
   * Continues a transaction started by a previous authenticateEv2First command.
   * {@link https://www.nxp.com/docs/en/data-sheet/NT4H2421Gx.pdf#page=49&zoom=100,200,154}
   * @param keySlot key slot # to authenticate into
   * @param key 16 byte key data
   * @returns response code
   */
  public async authenticateEv2NonFirst(keySlot: number, key: Buffer) {
    if (!this.isAuthenticated) throw new Error(`Must call authenticateFirst before using authenticateNonFirst`);

    const partOne = await this.authenticateEv2NonFirstPartOne(keySlot);

    const randB = decrypt(partOne.subarray(0, 16), Buffer.alloc(16), key, 'aes-128-cbc');
    const randA = Buffer.from(crypto.randomBytes(16));

    const randBRotatedLeft = Buffer.concat([randB.subarray(1), randB.subarray(0, 1)]);

    const encrypted = encrypt(
      Buffer.concat([randA, Buffer.from(randBRotatedLeft)]),
      Buffer.alloc(16),
      key,
      'aes-128-cbc'
    );

    await this.aesAuthenticateEv2NonFirstPartTwo(encrypted);

    this.sessionKeyEncryption = generateEncKey(randA, randB, key);
    this.sessionKeyMac = generateMacKey(randA, randB, key);

    return [0x91, 0x00];
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

  private incrementCommandCounter() {
    if (!this.commandCounter) return;
    else if (this.commandCounter[0]! < 0xff) this.commandCounter[0] += 1;
    else this.commandCounter[1] += 1;
  }

  private async sendCommand({ adpuHeader, commandHeader, commandData, commandMode, includeLe }: CommandOptions) {
    switch (commandMode) {
      case 'plain': {
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

      case 'mac': {
        if (!this.isAuthenticated) {
          throw new Error('Please authenticate first to use this command');
        }

        const mac = generateMac(
          adpuHeader.slice(1, 2),
          commandHeader,
          commandData,
          this.commandCounter!,
          this.transactionId!,
          this.sessionKeyMac!
        );

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

        if (response[response.length - 1] !== 0x00) throw new NtagError(adpuHeader.slice(0, 2), response.slice(-2));

        this.incrementCommandCounter();

        return verifyMac(response, this.commandCounter!, this.transactionId!, this.sessionKeyMac!);
      }

      case 'full': {
        if (!this.isAuthenticated) {
          throw new Error('Please authenticate first to use this command');
        }

        const encryptedData = encryptPayload(
          commandData,
          this.transactionId!,
          this.commandCounter!,
          this.sessionKeyEncryption!
        );

        const mac = generateMac(
          adpuHeader.slice(1, 2),
          commandHeader,
          encryptedData,
          this.commandCounter!,
          this.transactionId!,
          this.sessionKeyMac!
        );

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

        if (response[response.length - 1] !== 0x00) throw new NtagError(adpuHeader.slice(0, 2), response.slice(-2));

        this.incrementCommandCounter();

        const decryptedResponse = decryptPayload(
          response,
          this.transactionId!,
          this.commandCounter!,
          this.sessionKeyEncryption!
        );

        return verifyMac(decryptedResponse, this.commandCounter!, this.transactionId!, this.sessionKeyMac!);
      }

      default:
        throw new Error('Invalid command mode');
    }
  }
}

export default Ntag424;
