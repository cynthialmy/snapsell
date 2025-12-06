import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import * as SplashScreen from 'expo-splash-screen';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import * as Linking from 'expo-linking';
import 'react-native-reanimated';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AnimatedSplash } from '@/components/animated-splash';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { initializePostHog } from '@/utils/analytics';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { parsePaymentCallback, verifyPayment } from '@/utils/payments';

// Prevent the native splash screen from auto-hiding
SplashScreen.preventAutoHideAsync();

function RootLayoutNav() {
  const { user, loading } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const colorScheme = useColorScheme();

  useEffect(() => {
    if (loading) return;

    const inAuthGroup = segments[0] === '(auth)';
    const inTabsGroup = segments[0] === '(tabs)';
    const onRootIndex = segments.length === 0 || (segments.length === 1 && segments[0] === 'index');

    if (!user && !inAuthGroup) {
      // Redirect to sign in if not authenticated
      router.replace('/(auth)/sign-in');
    } else if (user && (inAuthGroup || onRootIndex)) {
      // Redirect to tabs if authenticated and in auth group or on root index
      router.replace('/(tabs)');
    }
  }, [user, loading, segments]);

  useEffect(() => {
    // Handle deep links
    const subscription = Linking.addEventListener('url', async (event) => {
      const { path, queryParams } = Linking.parse(event.url);

      // Handle auth callback
      if (path === 'auth/callback') {
        // Auth state will be updated by AuthContext
        router.replace('/(tabs)');
      }

      // Handle payment callback
      if (path === 'payment/callback') {
        const callback = parsePaymentCallback(event.url);
        if (callback.status === 'success' && callback.referenceId) {
          const { verified } = await verifyPayment(callback.referenceId);
          if (verified) {
            router.push('/(tabs)/upgrade');
            // Show success message
          }
        }
      }

      // Handle share links
      if (path === 'share' && queryParams?.slug) {
        router.push(`/share/${queryParams.slug}`);
      }
    });

    // Check if app was opened with a deep link
    Linking.getInitialURL().then((url) => {
      if (url) {
        const { path, queryParams } = Linking.parse(url);
        if (path === 'share' && queryParams?.slug) {
          router.push(`/share/${queryParams.slug}`);
        }
      }
    });

    return () => {
      subscription.remove();
    };
  }, []);

  return (
    <Stack>
      <Stack.Screen name="(auth)" options={{ headerShown: false }} />
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen
        name="share/[slug]"
        options={{
          title: 'Shared Listing',
          headerShown: true,
        }}
      />
    </Stack>
  );
}

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
        <AuthProvider>
          <RootLayoutNav />
          <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
          {showAnimatedSplash && (
            <AnimatedSplash
              imageSource={require('@/assets/images/Snappy_Animation.png')}
              backgroundColor={colorScheme === 'dark' ? '#000000' : '#ffffff'}
              duration={2500} // Show animation for 2.5 seconds
              onAnimationComplete={handleAnimatedSplashComplete}
            />
          )}
        </AuthProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
