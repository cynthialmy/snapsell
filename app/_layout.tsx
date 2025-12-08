import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import * as Linking from 'expo-linking';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import 'react-native-reanimated';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AnimatedSplash } from '@/components/animated-splash';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { initializePostHog } from '@/utils/analytics';
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
    const onListingPreview = inTabsGroup && segments[1] === 'listing-preview';
    const onShareScreen = segments[0] === 'share';
    // Check if we're on tabs index (first tab, which is the home screen)
    // When in tabs group with only one segment, we're on the index tab
    const onTabsIndex = inTabsGroup && segments.length === 1;

    // Allow unauthenticated access to all tabs - individual screens handle non-logged state
    if (!user && !inAuthGroup) {
      // If not in tabs group and not on share screen, redirect to tabs index
      if (!inTabsGroup && !onShareScreen) {
        router.replace('/(tabs)' as any);
      }
      // Allow access to all tabs - screens will show appropriate messages for non-logged users
    } else if (user && inAuthGroup) {
      // Redirect to tabs if authenticated and in auth group
      router.replace('/(tabs)');
    } else if (user && !inTabsGroup && !inAuthGroup && !onShareScreen) {
      // Redirect authenticated users from root index to tabs
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
