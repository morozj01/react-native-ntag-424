# :star: react-native-ntag-424

An easy to use React Native library that simplifies integration with the NTAG-424 class of NFC chips from NXP.

Implemented according to the [NTAG-424 datasheet.](https://www.nxp.com/docs/en/data-sheet/NT4H2421Gx.pdf)

**Supported functionality**

- :unlock: Authentication and session management
- :key: Setting encryption keys
- :file_folder: Reading and writing file data
- :calling: Configuring SDM and SUN

## Getting Started

### Installation

```sh

yarn add react-native-ntag-424

```

### Polyfilling the `crypto` module

This library depends on Node's built-in `crypto` module.

`react-native-quick-crypto` is a highly performant polyfill which is included as a dependency of this package, but to properly configure your bundler you must follow the instructions [here.](https://github.com/margelo/react-native-quick-crypto?tab=readme-ov-file#replace-crypto-browserify)

### Configuring peer dependencies

This library depends on the [react-native-nfc-manager](https://github.com/revtel/react-native-nfc-manager) package for cross platform NFC functionality.

Please ensure you have installed `react-native-nfc-manager` and followed [these instructions](https://github.com/revtel/react-native-nfc-manager?tab=readme-ov-file#installation) and properly configured your project with react-native-nfc-manager.

## Usage

### Example

```js
import Ntag424 from 'react-native-ntag-424';

import nfcManager from 'react-native-nfc-manager';

const ntag424 = new Ntag424(nfcManager);

async function scan() {
  // begin NFC scan
  await ntag424.initiate();

  // select application/DF level
  await ntag424Ref.selectFile('application');

  // authenticate into key slot #0 using the default key (16 zero bytes)
  await ntag424Ref.authenticateEv2First(0, Buffer.alloc(16));

  // retrieve card UID
  const uid = await ntag424.getCardUid();

  // end NFC scan
  await ntag424.terminate();
}
```

> See the [example](./example) app

### API

View the complete documentation [here](https://morozj01.github.io/react-native-ntag-424/classes/default.html).

## Contributing

See the [contributing guide](CONTRIBUTING.md) to learn how to contribute to the repository and the development workflow.

## License

MIT

---

Made with [create-react-native-library](https://github.com/callstack/react-native-builder-bob)
