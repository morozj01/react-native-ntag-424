import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Platform, Button } from 'react-native';
import nfcManager from 'react-native-nfc-manager';
import AndroidPrompt from './components/AndroidPrompt';
import Ntag424 from 'react-native-ntag-424';

function App() {
  const [hasNfc, setHasNfc] = useState(null as null | boolean);
  const [modalVisible, setModalVisible] = useState(false);

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

  async function scanTag() {
    if (Platform.OS === 'android') {
      setModalVisible(true);
    }

    ntag424Ref.current = new Ntag424(nfcManager);

    try {
      /**
       * @TODO Testing basic functionality
       */
      setModalVisible(false);
    } catch (err: any) {
      console.warn(err);
    } finally {
      await ntag424Ref.current?.terminate();
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

        <AndroidPrompt
          visible={modalVisible}
          hideModal={async () => {
            setModalVisible(false);
            await ntag424Ref.current?.terminate();
          }}
        />
      </View>
    );
  }

  return null;
}

const styles = StyleSheet.create({
  wrapper: {
    flex: 0,
    justifyContent: 'center',
    padding: 20,
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
});

export default App;
