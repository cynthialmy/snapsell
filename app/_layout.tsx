import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import * as Linking from 'expo-linking';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, AppState, Platform } from 'react-native';
import 'react-native-reanimated';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AnimatedSplash } from '@/components/animated-splash';
import { SnappyCelebration } from '@/components/SnappyCelebration';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { initializePostHog, trackEvent } from '@/utils/analytics';
import { checkQuota } from '@/utils/listings-api';
import { parsePaymentCallback, verifyPaymentStatus } from '@/utils/payments';

// Prevent the native splash screen from auto-hiding
SplashScreen.preventAutoHideAsync();

// Module-level flag to persist splash dismissal across remounts
// This prevents the splash from re-showing if the component remounts
let splashDismissedPermanent = false;

function RootLayoutNav() {
  const { user, loading, refreshUser } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const colorScheme = useColorScheme();
  const [showCelebration, setShowCelebration] = useState(false);
  const [celebrationsAdded, setCelebrationsAdded] = useState(0);
  const [savesAdded, setSavesAdded] = useState(0);

  useEffect(() => {
    if (loading) return;

    const inAuthGroup = segments[0] === '(auth)';
    const inTabsGroup = segments[0] === '(tabs)';
    const onListingPreview = inTabsGroup && segments[1] === 'listing-preview';
    const onShareScreen = segments[0] === 'share';
    const onAuthCallback = segments[0] === 'auth' && segments[1] === 'callback';
    const onProfileScreen = segments[0] === 'profile';
    const onPurchaseScreen = segments[0] === 'purchase';
    // Check if we're on the root index route (welcome page)
    const onRootIndex = segments.length === 0 || (segments.length === 1 && segments[0] === 'index');
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

    // If on root index (welcome page), always redirect to tabs (which shows the same content)
    if (onRootIndex && !inTabsGroup) {
      router.replace('/(tabs)' as any);
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

          // Get quota before purchase to calculate difference
          let quotaBefore: { quota: any } | null = null;
          try {
            const { quota } = await checkQuota();
            quotaBefore = { quota };
          } catch (e) {
            // Ignore errors getting quota before
          }

          // Wait 3 seconds for webhook to process, then refresh and verify
          setTimeout(async () => {
            try {
              // Refresh user data first (webhook should have processed by now)
              await refreshUser();

              // Refresh quota after payment
              const { quota: quotaAfter } = await checkQuota();

              // Try to verify payment status
              try {
                const result = await verifyPaymentStatus(sessionId);

                // Determine what was added based on payment type
                let creationsAdded = 0;
                let savesAdded = 0;

                if (result.payment.type === 'credits' || result.payment.credits) {
                  // Pack purchase - credits field contains the amount added
                  const creditsAdded = result.payment.credits || 0;

                  if (creditsAdded > 0) {
                    creationsAdded = creditsAdded;
                    savesAdded = creditsAdded;

                    // Show celebration modal
                    setCelebrationsAdded(creationsAdded);
                    setSavesAdded(savesAdded);
                    setShowCelebration(true);
                  } else {
                    // Credits is 0 or missing, try to calculate from quota difference
                    if (quotaBefore?.quota && quotaAfter) {
                      creationsAdded = Math.max(0,
                        (quotaAfter.bonus_creations_remaining || 0) - (quotaBefore.quota.bonus_creations_remaining || 0)
                      );
                      savesAdded = Math.max(0,
                        quotaAfter.free_save_slots - quotaBefore.quota.free_save_slots
                      );

                      if (creationsAdded > 0 || savesAdded > 0) {
                        setCelebrationsAdded(creationsAdded);
                        setSavesAdded(savesAdded);
                        setShowCelebration(true);
                      } else {
                        Alert.alert(
                          'Payment Successful',
                          `You now have ${quotaAfter.save_slots_remaining} Save Slots remaining.`
                        );
                      }
                    } else {
                      Alert.alert(
                        'Payment Successful',
                        'Your payment has been processed. Your account has been updated.'
                      );
                    }
                  }
                } else if (result.payment.type === 'subscription') {
                  // Subscription - unlimited, no specific amounts to show
                  Alert.alert(
                    'Payment Successful',
                    'You now have Pro! Enjoy unlimited creations and Save Slots.'
                  );
                } else {
                  // Fallback: try to calculate from quota difference
                  if (quotaBefore?.quota && quotaAfter) {
                    // Calculate creations added: compare bonus_creations_remaining
                    creationsAdded = Math.max(0,
                      (quotaAfter.bonus_creations_remaining || 0) - (quotaBefore.quota.bonus_creations_remaining || 0)
                    );
                    // Calculate saves added: compare free_save_slots (total available)
                    savesAdded = Math.max(0,
                      quotaAfter.free_save_slots - quotaBefore.quota.free_save_slots
                    );

                    if (creationsAdded > 0 || savesAdded > 0) {
                      setCelebrationsAdded(creationsAdded);
                      setSavesAdded(savesAdded);
                      setShowCelebration(true);
                    } else {
                      Alert.alert(
                        'Payment Successful',
                        `You now have ${quotaAfter.save_slots_remaining} Save Slots remaining.`
                      );
                    }
                  } else {
                    Alert.alert(
                      'Payment Successful',
                      'Your payment has been processed. Your account has been updated.'
                    );
                  }
                }

                trackEvent('purchase_completed', {
                  session_id: sessionId,
                  credits: result.payment.credits,
                  type: result.payment.type,
                  creations_added: creationsAdded,
                  saves_added: savesAdded,
                });
              } catch (verifyError) {
                // Verification failed, but webhook might have processed it
                // Try to show celebration based on quota difference
                if (quotaBefore?.quota && quotaAfter) {
                  const creationsAdded = Math.max(0,
                    (quotaAfter.creations_remaining_today + (quotaAfter.creations_daily_limit - quotaAfter.creations_remaining_today)) -
                    (quotaBefore.quota.creations_remaining_today + (quotaBefore.quota.creations_daily_limit - quotaBefore.quota.creations_remaining_today))
                  );
                  const savesAdded = Math.max(0,
                    (quotaAfter.free_save_slots - quotaAfter.save_slots_remaining) -
                    (quotaBefore.quota.free_save_slots - quotaBefore.quota.save_slots_remaining)
                  );

                  if (creationsAdded > 0 || savesAdded > 0) {
                    setCelebrationsAdded(creationsAdded);
                    setSavesAdded(savesAdded);
                    setShowCelebration(true);
                  } else {
                    Alert.alert(
                      'Payment Successful',
                      'Your payment has been processed. Your Save Slots will be updated shortly.'
                    );
                  }
                } else {
                  Alert.alert(
                    'Payment Successful',
                    'Your payment has been processed. Your Save Slots will be updated shortly.'
                  );
                }

                trackEvent('purchase_completed', {
                  session_id: sessionId,
                  verified: false,
                });
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

            // Get quota before purchase to calculate difference
            let quotaBefore: { quota: any } | null = null;
            try {
              const { quota } = await checkQuota();
              quotaBefore = { quota };
            } catch (e) {
              // Ignore errors getting quota before
            }

            // Wait 3 seconds for webhook to process, then refresh and verify
            setTimeout(async () => {
              try {
                // Refresh user data first (webhook should have processed by now)
                await refreshUser();

                // Refresh quota after payment
                const { quota: quotaAfter } = await checkQuota();

                // Try to verify payment status
                try {
                  const result = await verifyPaymentStatus(sessionId);

                  // Determine what was added based on payment type
                  let creationsAdded = 0;
                  let savesAdded = 0;

                  if (result.payment.type === 'credits') {
                    // Pack purchase - credits field contains the amount added
                    const creditsAdded = result.payment.credits || 0;
                    creationsAdded = creditsAdded;
                    savesAdded = creditsAdded;

                    // Show celebration modal
                    setCelebrationsAdded(creationsAdded);
                    setSavesAdded(savesAdded);
                    setShowCelebration(true);
                  } else if (result.payment.type === 'subscription') {
                    // Subscription - unlimited, no specific amounts to show
                    Alert.alert(
                      'Payment Successful',
                      'You now have Pro! Enjoy unlimited creations and Save Slots.'
                    );
                  } else {
                    // Fallback: try to calculate from quota difference
                    if (quotaBefore?.quota && quotaAfter) {
                      // Calculate creations added: compare bonus_creations_remaining
                      creationsAdded = Math.max(0,
                        (quotaAfter.bonus_creations_remaining || 0) - (quotaBefore.quota.bonus_creations_remaining || 0)
                      );
                      // Calculate saves added: compare free_save_slots (total available)
                      savesAdded = Math.max(0,
                        quotaAfter.free_save_slots - quotaBefore.quota.free_save_slots
                      );

                      if (creationsAdded > 0 || savesAdded > 0) {
                        setCelebrationsAdded(creationsAdded);
                        setSavesAdded(savesAdded);
                        setShowCelebration(true);
                      } else {
                        Alert.alert(
                          'Payment Successful',
                          `You now have ${quotaAfter.save_slots_remaining} Save Slots remaining.`
                        );
                      }
                    } else {
                      Alert.alert(
                        'Payment Successful',
                        'Your payment has been processed. Your account has been updated.'
                      );
                    }
                  }

                  trackEvent('purchase_completed', {
                    session_id: sessionId,
                    credits: result.payment.credits,
                    type: result.payment.type,
                    creations_added: creationsAdded,
                    saves_added: savesAdded,
                    source: 'cold_start',
                  });
                } catch (verifyError) {
                  // Verification failed, but webhook might have processed it
                  // Try to show celebration based on quota difference
                  if (quotaBefore?.quota && quotaAfter) {
                    // Calculate creations added: compare bonus_creations_remaining
                    const creationsAdded = Math.max(0,
                      (quotaAfter.bonus_creations_remaining || 0) - (quotaBefore.quota.bonus_creations_remaining || 0)
                    );
                    // Calculate saves added: compare free_save_slots (total available)
                    const savesAdded = Math.max(0,
                      quotaAfter.free_save_slots - quotaBefore.quota.free_save_slots
                    );

                    if (creationsAdded > 0 || savesAdded > 0) {
                      setCelebrationsAdded(creationsAdded);
                      setSavesAdded(savesAdded);
                      setShowCelebration(true);
                    } else {
                      Alert.alert(
                        'Payment Successful',
                        'Your payment has been processed. Your Save Slots will be updated shortly.'
                      );
                    }
                  } else {
                    Alert.alert(
                      'Payment Successful',
                      'Your payment has been processed. Your Save Slots will be updated shortly.'
                    );
                  }

                  trackEvent('purchase_completed', {
                    session_id: sessionId,
                    verified: false,
                    source: 'cold_start',
                  });
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
    <>
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
      <SnappyCelebration
        visible={showCelebration}
        creationsAdded={celebrationsAdded}
        savesAdded={savesAdded}
        onComplete={() => {
          setShowCelebration(false);
          // Refresh quota in upgrade screen when user navigates there
          // The upgrade screen will refresh on focus
        }}
      />
    </>
  );
}

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const [appIsReady, setAppIsReady] = useState(false);
  const [showAnimatedSplash, setShowAnimatedSplash] = useState(false);
  const safetyTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const splashDismissedRef = useRef(splashDismissedPermanent);

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
    // Sync ref with module-level flag
    splashDismissedRef.current = splashDismissedPermanent;

    // Don't show splash again if it was already dismissed
    if (splashDismissedPermanent || splashDismissedRef.current) {
      return;
    }

    async function hideSplashAndShowAnimation() {
      if (appIsReady && !splashDismissedPermanent && !splashDismissedRef.current) {
        // Clear any existing timeout first
        if (safetyTimeoutRef.current) {
          clearTimeout(safetyTimeoutRef.current);
          safetyTimeoutRef.current = null;
        }

        // Hide the native splash screen
        await SplashScreen.hideAsync();
        // Show the animated APNG splash
        setShowAnimatedSplash(true);

        // Safety timeout: force dismiss splash after 2.5 seconds even if animation doesn't complete
        // More aggressive timeout to prevent long blocking
        safetyTimeoutRef.current = setTimeout(() => {
          splashDismissedRef.current = true;
          splashDismissedPermanent = true; // Persist across remounts
          setShowAnimatedSplash(false);
          safetyTimeoutRef.current = null;
        }, 2500);
      }
    }

    void hideSplashAndShowAnimation();

    // Return cleanup from useEffect - now we can properly clear the timeout
    return () => {
      if (safetyTimeoutRef.current) {
        clearTimeout(safetyTimeoutRef.current);
        safetyTimeoutRef.current = null;
      }
    };
  }, [appIsReady]);

  const handleAnimatedSplashComplete = useCallback(() => {
    // Prevent multiple calls
    if (splashDismissedRef.current) {
      return;
    }

    splashDismissedRef.current = true;
    splashDismissedPermanent = true; // Persist across remounts

    // Clear safety timeout if animation completes early
    if (safetyTimeoutRef.current) {
      clearTimeout(safetyTimeoutRef.current);
      safetyTimeoutRef.current = null;
    }

    // Force immediate state update - don't wait for interactions if JS thread is blocked
    setShowAnimatedSplash(false);
  }, []);

  // Listen for app state changes to force splash dismiss if stuck
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      if (nextAppState === 'active') {
        // If splash was dismissed but state update didn't process, force it now
        // Also force dismiss if splash has been showing for too long (stuck)
        if (splashDismissedPermanent || splashDismissedRef.current || showAnimatedSplash) {
          splashDismissedRef.current = true;
          splashDismissedPermanent = true; // Persist across remounts
          setShowAnimatedSplash(false);
        }
      }
    });

    return () => {
      subscription.remove();
    };
  }, [showAnimatedSplash]);

  if (!appIsReady) {
    return null;
  }

  return (
    <SafeAreaProvider>
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <AuthProvider>
          <RootLayoutNav />
          <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
          {showAnimatedSplash && !splashDismissedRef.current && (
            <AnimatedSplash
              imageSource={require('@/assets/images/Snappy_Animation.png')}
              backgroundColor={colorScheme === 'dark' ? '#000000' : '#ffffff'}
              duration={1500} // Show animation for 1.5 seconds (reduced to prevent blocking)
              onAnimationComplete={handleAnimatedSplashComplete}
            />
          )}
        </AuthProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
