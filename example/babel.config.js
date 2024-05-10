const path = require('path');
const pak = require('../package.json');

module.exports = {
  presets: ['module:@react-native/babel-preset'],
  plugins: [
    [
      'module-resolver',
      {
        extensions: ['.tsx', '.ts', '.js', '.json'],
        alias: {
          [pak.name]: path.join(__dirname, '..', pak.source),
          crypto: path.join(__dirname, '..', 'node_modules/react-native-quick-crypto'),
          stream: path.join(__dirname, '..', 'node_modules/stream-browserify'),
          buffer: path.join(__dirname, '..', 'node_modules/@craftzdog/react-native-buffer'),
        },
      },
    ],
  ],
};
