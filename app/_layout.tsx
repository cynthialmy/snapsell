import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import * as SplashScreen from 'expo-splash-screen';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import 'react-native-reanimated';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AnimatedSplash } from '@/components/animated-splash';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { initializePostHog } from '@/utils/analytics';

// Prevent the native splash screen from auto-hiding
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const [appIsReady, setAppIsReady] = useState(false);
  const [showAnimatedSplash, setShowAnimatedSplash] = useState(false);

  useEffect(() => {
    async function prepare() {
      try {
        // Initialize PostHog
        await initializePostHog();

        // Small delay to ensure everything is ready
        await new Promise(resolve => setTimeout(resolve, 500));
      } catch (e) {
        console.warn(e);
      } finally {
        // Mark app as ready
        setAppIsReady(true);
      }
    }

    void prepare();
  }, []);

  useEffect(() => {
    async function hideSplashAndShowAnimation() {
      if (appIsReady) {
        // Hide the native splash screen
        await SplashScreen.hideAsync();
        // Show the animated APNG splash
        setShowAnimatedSplash(true);
      }
    }

    void hideSplashAndShowAnimation();
  }, [appIsReady]);

  const handleAnimatedSplashComplete = () => {
    setShowAnimatedSplash(false);
  };

  if (!appIsReady) {
    return null;
  }

  return (
    <SafeAreaProvider>
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <Stack>
          <Stack.Screen name="index" options={{ headerShown: false }} />
          <Stack.Screen
            name="listing-preview"
            options={{
              title: 'Listing Preview',
              headerBackTitle: 'Home',
            }}
          />
        </Stack>
        <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
        {showAnimatedSplash && (
          <AnimatedSplash
            imageSource={require('@/assets/images/Snappy_Animation.png')}
            backgroundColor={colorScheme === 'dark' ? '#000000' : '#ffffff'}
            duration={2500} // Show animation for 2.5 seconds
            onAnimationComplete={handleAnimatedSplashComplete}
          />
        )}
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
