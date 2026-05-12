import { View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '@/src/lib/supabase';

export default function ProfileScreen() {
  async function handleSignOut() {
    Alert.alert('Sign out', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out',
        style: 'destructive',
        onPress: () => supabase.auth.signOut(),
      },
    ]);
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <View style={styles.inner}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>Z</Text>
        </View>
        <Text style={styles.name}>Your Account</Text>

        <View style={styles.menu}>
          {['Edit profile', 'Preferences', 'Settings'].map((item) => (
            <TouchableOpacity key={item} style={styles.menuItem}>
              <Text style={styles.menuText}>{item}</Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity style={[styles.menuItem, styles.menuDanger]} onPress={handleSignOut}>
            <Text style={styles.menuTextDanger}>Sign out</Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F7F9FC' },
  inner: { flex: 1, alignItems: 'center', paddingTop: 48, paddingHorizontal: 24 },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#1A2B4C',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: '#fff', fontSize: 28, fontWeight: '700' },
  name: { marginTop: 16, fontSize: 18, fontWeight: '600', color: '#1A1A1A' },
  menu: { width: '100%', marginTop: 40, gap: 2 },
  menuItem: {
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E1E6EE',
  },
  menuDanger: { marginTop: 16, borderColor: '#FECACA' },
  menuText: { fontSize: 15, color: '#1A1A1A' },
  menuTextDanger: { fontSize: 15, color: '#A52A2A' },
});
