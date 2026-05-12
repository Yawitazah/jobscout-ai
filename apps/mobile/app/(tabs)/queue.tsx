import { View, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function QueueScreen() {
  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <View style={styles.center}>
        <Text style={styles.text}>Job Queue</Text>
        <Text style={styles.sub}>Swipe cards coming in 6.3</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F7F9FC' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  text: { fontSize: 22, fontWeight: '700', color: '#1A2B4C' },
  sub: { fontSize: 14, color: '#5A6478' },
});
