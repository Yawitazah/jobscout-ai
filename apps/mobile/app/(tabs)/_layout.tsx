import { Tabs } from 'expo-router';
import { Platform } from 'react-native';
import { BriefcaseIcon, InboxIcon, CalendarIcon, UserIcon } from 'lucide-react-native';

const BRAND = '#1A2B4C';
const MUTED = '#5A6478';

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: BRAND,
        tabBarInactiveTintColor: MUTED,
        tabBarStyle: {
          height: Platform.OS === 'ios' ? 80 : 64,
          paddingBottom: Platform.OS === 'ios' ? 24 : 8,
          backgroundColor: '#fff',
          borderTopColor: '#E1E6EE',
        },
        headerStyle: { backgroundColor: '#fff' },
        headerTintColor: '#1A1A1A',
        headerShadowVisible: false,
      }}
    >
      <Tabs.Screen
        name="queue"
        options={{
          title: 'Job Queue',
          tabBarLabel: 'Queue',
          tabBarIcon: ({ color, size }) => <BriefcaseIcon color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="applications"
        options={{
          title: 'Applications',
          tabBarLabel: 'Applied',
          tabBarIcon: ({ color, size }) => <InboxIcon color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="interviews"
        options={{
          title: 'Interviews',
          tabBarLabel: 'Interviews',
          tabBarIcon: ({ color, size }) => <CalendarIcon color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarLabel: 'Profile',
          tabBarIcon: ({ color, size }) => <UserIcon color={color} size={size} />,
        }}
      />
    </Tabs>
  );
}
