import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Platform, Button } from 'react-native';
import nfcManager from 'react-native-nfc-manager';
import AndroidPrompt from './components/AndroidPrompt';
import Ntag424 from 'react-native-ntag-424';

function App() {
  const [hasNfc, setHasNfc] = useState(null as null | boolean);
  const [modalVisible, setModalVisible] = useState(false);
  const [log, setLog] = useState([] as Array<string>);

  let ntag424Ref = useRef(null as null | Ntag424);

  useEffect(() => {
    const checkNfc = async () => {
      const supported = await nfcManager.isSupported();

      if (supported) {
        nfcManager.start();
      }

      setHasNfc(supported);
    };

    checkNfc();
  }, []);

  const addLogs = (newLogs: Array<string>) => {
    setLog([...log, ...newLogs]);
  };

  const terminateScan = async () => {
    setModalVisible(false);
    await ntag424Ref.current?.terminate();
  };

  async function scanTag() {
    if (Platform.OS === 'android') {
      setModalVisible(true);
    }

    const newLogs: Array<string> = [];

    ntag424Ref.current = new Ntag424(nfcManager);

    try {
      newLogs.push('Beginning NFC scan');

      await ntag424Ref.current.initiate();

      newLogs.push('Found tag');

      const fileSelect = await ntag424Ref.current.selectFile('application');

      newLogs.push(`Select File: ${fileSelect}`);

      const authentication = await ntag424Ref.current.authenticateEv2First(0, Buffer.alloc(16));

      newLogs.push(`AuthenticateFirstEv2: ${authentication}`);

      const cardUid = await ntag424Ref.current.getCardUid();

      newLogs.push(
        `CardUID: ${cardUid
          .slice(0, 7)
          .map((num) => num.toString(16).padStart(2, '0'))
          .join('')}`
      );

      /**
       * @TODO Add more complex testing functionality
       */
    } catch (err: any) {
      newLogs.push(`Error: ${err.message}`);
    } finally {
      addLogs(newLogs);
      await terminateScan();
    }
  }

  if (hasNfc) {
    return (
      <View style={styles.wrapper}>
        <View>
          <Text style={styles.title}>REACT NATIVE NTAG 424</Text>
        </View>

        <View>
          <Button title="Scan a Tag" onPress={scanTag} />
        </View>

        <View style={styles.logContainer}>
          {log.map((logEntry, index) => (
            <Text key={index} style={styles.logEntry}>
              {logEntry}
            </Text>
          ))}
        </View>

        <AndroidPrompt visible={modalVisible} hideModal={terminateScan} />
      </View>
    );
  }

  return null;
}

const styles = StyleSheet.create({
  wrapper: {
    flex: 0,
    padding: 25,
    backgroundColor: '#f7f6f2',
    height: '100%',
  },
  title: {
    textAlign: 'center',
    fontSize: 16,
    paddingBottom: 12,
    marginBottom: 15,
    borderBottomColor: 'black',
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  button: {
    display: 'flex',
    flex: 1,
  },
  logContainer: {
    borderWidth: 0.5,
    backgroundColor: '#ffffff',
    borderRadius: 10,
    marginTop: 15,
    padding: 10,
    flexGrow: 1,
  },
  logEntry: {
    marginBottom: 8,
  },
});

export default App;
