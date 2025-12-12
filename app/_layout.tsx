import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import * as Linking from 'expo-linking';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { Alert, Platform } from 'react-native';
import 'react-native-reanimated';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AnimatedSplash } from '@/components/animated-splash';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { initializePostHog, trackEvent } from '@/utils/analytics';
import { parsePaymentCallback, verifyPaymentStatus } from '@/utils/payments';

// Prevent the native splash screen from auto-hiding
SplashScreen.preventAutoHideAsync();

function RootLayoutNav() {
  const { user, loading, refreshUser } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const colorScheme = useColorScheme();

  useEffect(() => {
    if (loading) return;

    const inAuthGroup = segments[0] === '(auth)';
    const inTabsGroup = segments[0] === '(tabs)';
    const onListingPreview = inTabsGroup && segments[1] === 'listing-preview';
    const onShareScreen = segments[0] === 'share';
    const onAuthCallback = segments[0] === 'auth' && segments[1] === 'callback';
    const onProfileScreen = segments[0] === 'profile';
    const onPurchaseScreen = segments[0] === 'purchase';
    // Check if we're on tabs index (first tab, which is the home screen)
    // When in tabs group with only one segment, we're on the index tab
    const onTabsIndex = inTabsGroup && segments.length === 1;

    // Don't interfere with auth callback route - it handles its own redirect
    if (onAuthCallback) {
      return;
    }

    // Don't interfere with profile modal - allow it to be shown
    if (onProfileScreen) {
      return;
    }

    // Don't interfere with purchase modal - allow it to be shown
    if (onPurchaseScreen) {
      return;
    }

    // Allow unauthenticated access to all tabs - individual screens handle non-logged state
    if (!user && !inAuthGroup) {
      // If not in tabs group and not on share screen, redirect to tabs index
      if (!inTabsGroup && !onShareScreen) {
        router.replace('/(tabs)' as any);
      }
      // Allow access to all tabs - screens will show appropriate messages for non-logged users
    } else if (user && inAuthGroup) {
      // Redirect to tabs if authenticated and in auth group
      // Try to dismiss modals, but don't fail if there's nothing to dismiss
      try {
        router.dismissAll();
      } catch (e) {
        // Ignore dismiss errors - replace will handle navigation
      }
      router.replace('/(tabs)');
    } else if (user && !inTabsGroup && !inAuthGroup && !onShareScreen) {
      // Redirect authenticated users from root index to tabs
      router.replace('/(tabs)');
    }
  }, [user, loading, segments]);

  useEffect(() => {
    // Helper function to handle auth callback
    const handleAuthCallback = async (url: string) => {
      const { path, queryParams } = Linking.parse(url);

      if (path === 'auth/callback' || url.includes('auth/callback')) {
        try {
          // Import supabase to process the auth callback
          const { supabase } = await import('@/utils/auth');

          // Supabase sends tokens in hash fragment (#access_token=...)
          // Extract hash fragment first, as that's where Supabase puts the auth data
          let token: string | undefined;
          let type: string | undefined;

          const hashIndex = url.indexOf('#');
          let hashFragment: string | null = null;
          let hashParams: URLSearchParams | null = null;

          if (hashIndex !== -1) {
            hashFragment = url.substring(hashIndex + 1);
            hashParams = new URLSearchParams(hashFragment);

            // Supabase hash fragment contains: access_token, token_type, expires_in, refresh_token, type
            const accessToken = hashParams.get('access_token');
            type = hashParams.get('type') || undefined;

            // For verifyOtp, we need the token from the email link
            // The hash might have 'token' or we might need to use access_token
            token = hashParams.get('token') || accessToken || undefined;
          }

          // Fallback: try query params
          if (!token || !type) {
            token = token || (queryParams?.token as string | undefined);
            type = type || (queryParams?.type as string | undefined);
          }

          console.log('Deep link auth callback - token:', token ? 'present' : 'missing', 'type:', type);

          // Check if URL contains access_token (session already created server-side)
          const accessToken = hashParams?.get('access_token');
          const refreshToken = hashParams?.get('refresh_token');
          const hasAccessToken = !!accessToken;

          if (hasAccessToken && refreshToken) {
            // URL contains access_token - session is already created server-side
            // We need to set the session explicitly using setSession
            console.log('URL contains access_token, setting session explicitly...');

            const { data: sessionData, error: sessionError } = await supabase.auth.setSession({
              access_token: accessToken,
              refresh_token: refreshToken,
            });

            if (sessionError) {
              console.error('Error setting session:', sessionError);
              return;
            }

            if (sessionData.session) {
              console.log('Session set successfully, user authenticated');
              // Force refresh the user in AuthContext
              await refreshUser();

              // Wait a bit longer to ensure AuthContext has updated, then dismiss all modals and navigate
              setTimeout(() => {
                // Try to dismiss modals, but don't fail if there's nothing to dismiss
                try {
                  router.dismissAll();
                } catch (e) {
                  // Ignore dismiss errors - replace will handle navigation
                }
                router.replace('/(tabs)');
              }, 800);
              return;
            }
          }

          // Fallback: Check session (in case detectSessionInUrl worked)
          const { data: sessionData, error: sessionError } = await supabase.auth.getSession();

          if (sessionError) {
            console.error('Error getting session:', sessionError);
            return;
          }

          if (sessionData.session) {
            console.log('Session found, user authenticated');
            // Force refresh the user in AuthContext
            await refreshUser();

            // Wait a bit longer to ensure AuthContext has updated, then dismiss all modals and navigate
            setTimeout(() => {
              // Try to dismiss modals, but don't fail if there's nothing to dismiss
              try {
                router.dismissAll();
              } catch (e) {
                // Ignore dismiss errors - replace will handle navigation
              }
              router.replace('/(tabs)');
            }, 800);
          } else {
            console.warn('Session was not created after processing auth callback URL');
            // If we have token/type but no session, the URL format might be wrong
            // The callback route will handle this case
          }
        } catch (error) {
          console.error('Error handling auth callback:', error);
        }
      }
    };

    // Handle deep links when app is already running
    const subscription = Linking.addEventListener('url', async (event) => {
      const { path, queryParams } = Linking.parse(event.url);

      // Handle auth callback (for email confirmation and magic links)
      await handleAuthCallback(event.url);

      // Handle payment callback (Stripe redirects to success URL)
      // Check both path and full URL to catch different redirect formats
      if (path === 'payment/callback' || path === 'payment/success' || path === 'payment/cancel' ||
          event.url.includes('/payment/success') || event.url.includes('/payment/cancel')) {
        const callback = parsePaymentCallback(event.url);

        if (path === 'payment/cancel') {
          trackEvent('purchase_cancelled', { source: 'payment_callback' });
          Alert.alert('Payment Cancelled', 'Your payment was cancelled. No charges were made.');
          router.push('/(tabs)/upgrade');
          return;
        }

        if (callback.status === 'success' && callback.sessionId) {
          const sessionId = callback.sessionId; // Store in const for closure
          // Wait a bit for webhook to process payment before verifying
          // The webhook processes payments automatically, so we just need to refresh user data
          router.push('/(tabs)/upgrade');

          // Wait 3 seconds for webhook to process, then refresh and verify
          setTimeout(async () => {
            try {
              // Refresh user data first (webhook should have processed by now)
              await refreshUser();

              // Try to verify payment status
              try {
                const result = await verifyPaymentStatus(sessionId);
                trackEvent('purchase_completed', {
                  session_id: sessionId,
                  credits: result.user.credits,
                });
                Alert.alert(
                  'Payment Successful',
                  `You now have ${result.user.credits} credits!`
                );
              } catch (verifyError) {
                // Verification failed, but webhook might have processed it
                // Just show a generic success message
                trackEvent('purchase_completed', {
                  session_id: sessionId,
                  verified: false,
                });
                Alert.alert(
                  'Payment Successful',
                  'Your payment has been processed. Your credits will be updated shortly.'
                );
              }
            } catch (error: any) {
              console.error('Error refreshing user after payment:', error);
              trackEvent('purchase_failed', {
                session_id: sessionId,
                error: error.message || 'Unknown error',
                stage: 'post_payment_refresh',
              });
              Alert.alert(
                'Payment Received',
                'Your payment is being processed. Please check your account in a moment.'
              );
            }
          }, 3000);
        } else if (callback.status === 'failed' || callback.status === 'cancelled') {
          trackEvent('purchase_failed', {
            status: callback.status,
            error: 'Payment cancelled or failed',
          });
          Alert.alert('Payment Cancelled', 'Your payment was cancelled. No charges were made.');
          router.push('/(tabs)/upgrade');
        }
      }

      // Handle share links
      if (path === 'share' && queryParams?.slug) {
        router.push(`/share/${queryParams.slug}`);
      }
    });

    // Check if app was opened with a deep link (cold start)
    Linking.getInitialURL().then(async (url) => {
      if (url) {
        const { path, queryParams } = Linking.parse(url);

        // Handle auth callback on app launch
        await handleAuthCallback(url);

        // Handle payment callback on app launch
        // Check both path and full URL to catch different redirect formats
        if (path === 'payment/callback' || path === 'payment/success' || path === 'payment/cancel' ||
            url.includes('/payment/success') || url.includes('/payment/cancel')) {
          const callback = parsePaymentCallback(url);

          if (path === 'payment/cancel' || url.includes('/payment/cancel') || callback.status === 'cancelled') {
            trackEvent('purchase_cancelled', { source: 'cold_start_callback' });
            Alert.alert('Payment Cancelled', 'Your payment was cancelled. No charges were made.');
            router.push('/(tabs)/upgrade');
            return;
          }

          if (callback.status === 'success' && callback.sessionId) {
            const sessionId = callback.sessionId; // Store in const for closure
            // Wait a bit for webhook to process payment before verifying
            // The webhook processes payments automatically, so we just need to refresh user data
            router.push('/(tabs)/upgrade');

            // Wait 3 seconds for webhook to process, then refresh and verify
            setTimeout(async () => {
              try {
                // Refresh user data first (webhook should have processed by now)
                await refreshUser();

                // Try to verify payment status
                try {
                  const result = await verifyPaymentStatus(sessionId);
                  trackEvent('purchase_completed', {
                    session_id: sessionId,
                    credits: result.user.credits,
                    source: 'cold_start',
                  });
                  Alert.alert(
                    'Payment Successful',
                    `You now have ${result.user.credits} Save Slots!`
                  );
                } catch (verifyError) {
                  // Verification failed, but webhook might have processed it
                  // Just show a generic success message
                  trackEvent('purchase_completed', {
                    session_id: sessionId,
                    verified: false,
                    source: 'cold_start',
                  });
                  Alert.alert(
                    'Payment Successful',
                    'Your payment has been processed. Your Save Slots will be updated shortly.'
                  );
                }
              } catch (error: any) {
                console.error('Error refreshing user after payment:', error);
                trackEvent('purchase_failed', {
                  session_id: sessionId,
                  error: error.message || 'Unknown error',
                  stage: 'post_payment_refresh',
                  source: 'cold_start',
                });
                Alert.alert(
                  'Payment Received',
                  'Your payment is being processed. Please check your account in a moment.'
                );
              }
            }, 3000);
          } else if (callback.status === 'failed') {
            trackEvent('purchase_failed', {
              status: callback.status,
              error: 'Payment failed',
              source: 'cold_start',
            });
            Alert.alert('Payment Failed', 'Your payment could not be processed. Please try again.');
            router.push('/(tabs)/upgrade');
          }
        }

        // Handle share links
        if (path === 'share' && queryParams?.slug) {
          router.push(`/share/${queryParams.slug}`);
        }
      }
    });

    return () => {
      subscription.remove();
    };
  }, [router]);

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
      <Stack.Screen
        name="profile"
        options={{
          title: 'Profile',
          headerShown: true,
          presentation: Platform.OS === 'ios' ? 'modal' : 'card',
          animation: Platform.OS === 'ios' ? 'default' : 'slide_from_bottom',
        }}
      />
      <Stack.Screen
        name="purchase"
        options={{
          title: 'Purchase Options',
          headerShown: true,
          presentation: Platform.OS === 'ios' ? 'modal' : 'card',
          animation: Platform.OS === 'ios' ? 'default' : 'slide_from_bottom',
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
