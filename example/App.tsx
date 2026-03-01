import { useState } from 'react';
import { iCloud, iCloudKVS } from 'react-native-icloud-kit';
import { Button, SafeAreaView, ScrollView, Text, View, StyleSheet } from 'react-native';

export default function App() {
  const [status, setStatus] = useState<string>('Tap a button to test');
  const [records, setRecords] = useState<string>('');

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView style={styles.container}>
        <Text style={styles.header}>react-native-icloud-kit</Text>

        <Group name="iCloud Availability">
          <Button
            title="Check iCloud"
            onPress={async () => {
              try {
                const available = await iCloud.isAvailable();
                setStatus(`iCloud available: ${available}`);
              } catch (e: any) {
                setStatus(`Error: ${e.message}`);
              }
            }}
          />
        </Group>

        <Group name="CloudKit Save">
          <Button
            title="Save a record"
            onPress={async () => {
              try {
                const id = await iCloud.save('TestRecord', {
                  name: 'Hello from example',
                  value: 42,
                  timestamp: Date.now(),
                });
                setStatus(`Saved record: ${id}`);
              } catch (e: any) {
                setStatus(`Error: ${e.message}`);
              }
            }}
          />
        </Group>

        <Group name="CloudKit Query">
          <Button
            title="Query all TestRecord"
            onPress={async () => {
              try {
                const results = await iCloud.query('TestRecord');
                setRecords(JSON.stringify(results, null, 2));
                setStatus(`Found ${results.length} records`);
              } catch (e: any) {
                setStatus(`Error: ${e.message}`);
              }
            }}
          />
          {records ? <Text style={styles.code}>{records}</Text> : null}
        </Group>

        <Group name="KVS">
          <Button
            title="Set KVS value"
            onPress={async () => {
              try {
                await iCloudKVS.set('testKey', JSON.stringify({ hello: 'world' }));
                setStatus('KVS value set');
              } catch (e: any) {
                setStatus(`Error: ${e.message}`);
              }
            }}
          />
          <Button
            title="Get KVS value"
            onPress={async () => {
              try {
                const val = await iCloudKVS.get('testKey');
                setStatus(`KVS value: ${val}`);
              } catch (e: any) {
                setStatus(`Error: ${e.message}`);
              }
            }}
          />
        </Group>

        <Group name="Status">
          <Text style={styles.status}>{status}</Text>
        </Group>
      </ScrollView>
    </SafeAreaView>
  );
}

function Group(props: { name: string; children: React.ReactNode }) {
  return (
    <View style={styles.group}>
      <Text style={styles.groupHeader}>{props.name}</Text>
      {props.children}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    fontSize: 30,
    margin: 20,
    fontWeight: 'bold',
  },
  groupHeader: {
    fontSize: 20,
    marginBottom: 20,
  },
  group: {
    margin: 20,
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 20,
  },
  container: {
    flex: 1,
    backgroundColor: '#eee',
  },
  status: {
    fontSize: 16,
    color: '#333',
  },
  code: {
    fontSize: 12,
    fontFamily: 'Courier',
    marginTop: 10,
    color: '#666',
  },
});
