import { Tabs } from 'expo-router';
import { Platform, Text } from 'react-native';

import { trackTabSwitch } from '@/utils/analytics';

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#4338CA',
        tabBarInactiveTintColor: '#64748B',
        tabBarStyle: {
          backgroundColor: '#FFFFFF',
          borderTopWidth: 1,
          borderTopColor: '#E2E8F0',
          paddingBottom: Platform.OS === 'ios' ? 20 : 8,
          paddingTop: 8,
          height: Platform.OS === 'ios' ? 88 : 60,
        },
      }}
      screenListeners={{
        tabPress: (e) => {
          const routeName = e.target?.split('/').pop() || 'unknown';
          // Map route names to tab names
          const tabNameMap: Record<string, string> = {
            'index': 'home',
            'my-listings': 'my-listings',
            'settings': 'settings',
            'upgrade': 'upgrade',
          };
          const tabName = tabNameMap[routeName] || routeName;
          trackTabSwitch(tabName);
        },
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color }) => <TabBarIcon name="home" color={color} />,
        }}
      />
      <Tabs.Screen
        name="my-listings"
        options={{
          title: 'My Listings',
          tabBarIcon: ({ color }) => <TabBarIcon name="list" color={color} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ color }) => <TabBarIcon name="settings" color={color} />,
        }}
      />
      <Tabs.Screen
        name="upgrade"
        options={{
          title: 'Upgrade',
          tabBarIcon: ({ color }) => <TabBarIcon name="star" color={color} />,
        }}
      />
      <Tabs.Screen
        name="listing-preview"
        options={{
          href: null, // Hide from tab bar
          headerShown: true,
          title: 'Listing Preview',
          headerBackTitle: 'Home',
        }}
      />
    </Tabs>
  );
}

function TabBarIcon({ name, color }: { name: string; color: string }) {
  // Simple text-based icons for now
  const icons: Record<string, string> = {
    home: '🏠',
    list: '📋',
    settings: '⚙️',
    star: '⭐',
  };

  return <Text style={{ fontSize: 24 }}>{icons[name] || '•'}</Text>;
}
