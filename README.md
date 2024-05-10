# react-native-ntag-424

Utilities that simplify integration with the ntag-424 class of NFC chips from NXP.

Implemented according to the [NTAG-424 datasheet](https://www.nxp.com/docs/en/data-sheet/NT4H2421Gx.pdf)

## Installation

```sh
npm install react-native-ntag-424
```

## Usage

```js
import Ntag424 from 'react-native-ntag-424';
import nfcManager from 'react-native-nfc-manager';

const ntag424 = new Ntag424(nfcManager);

// begin NFC scan
await ntag424.initialize();

const uid = await ntag424.getCardUid();

// complete NFC scan
await ntag424.terminate();
```

## Contributing

See the [contributing guide](CONTRIBUTING.md) to learn how to contribute to the repository and the development workflow.

## License

MIT

---

Made with [create-react-native-library](https://github.com/callstack/react-native-builder-bob)
