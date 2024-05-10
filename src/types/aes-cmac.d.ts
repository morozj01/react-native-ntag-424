declare module 'node-aes-cmac' {
  function aesCmac(
    key: string | Buffer,
    message: string | Buffer,
    options: { returnAsBuffer: true }
  ): Buffer;
  function aesCmac(
    key: string | Buffer,
    message: string | Buffer,
    options: { returnAsBuffer: false }
  ): string;
  export { aesCmac };
}
