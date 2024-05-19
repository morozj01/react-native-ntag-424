export class NtagError extends Error {
  constructor(commandCode: number[], responseCode: number[]) {
    const failedCommand = commandCode.map((byte) => byte.toString(16).padStart(2, '0'));
    const errorCode = responseCode.map((byte) => byte.toString(16).padStart(2, '0'));
    super(`Command failed | command code: ${failedCommand} | error code: ${errorCode}`);
  }
}
