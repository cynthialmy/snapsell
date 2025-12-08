import { Stack } from 'expo-router';
import { Platform } from 'react-native';

export default function AuthLayout() {
  return (
    <Stack>
      <Stack.Screen
        name="sign-in"
        options={{
          headerShown: false,
          // Present as modal on iOS for better UX
          presentation: Platform.OS === 'ios' ? 'modal' : 'card',
          animation: Platform.OS === 'ios' ? 'default' : 'slide_from_right',
        }}
      />
      <Stack.Screen name="sign-up" options={{ headerShown: false }} />
      <Stack.Screen name="magic-link" options={{ headerShown: false }} />
      <Stack.Screen name="profile" options={{ headerShown: false }} />
    </Stack>
  );
}
