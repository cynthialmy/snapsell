/**
 * Auth Callback Route
 *
 * This route handles Supabase auth callbacks (email confirmation, magic links, etc.)
 * Processes tokens from URL parameters and verifies them with Supabase.
 */

import * as Linking from 'expo-linking';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/utils/auth';

export default function AuthCallbackScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { user, refreshUser, loading } = useAuth();
  const [status, setStatus] = useState<'verifying' | 'success' | 'error'>('verifying');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [callbackUrl, setCallbackUrl] = useState<string | null>(null);

  // Listen for URL events to capture the callback URL
  useEffect(() => {
    const subscription = Linking.addEventListener('url', (event) => {
      if (event.url.includes('auth/callback')) {
        setCallbackUrl(event.url);
      }
    });

    // Also get initial URL
    Linking.getInitialURL().then((url) => {
      if (url && url.includes('auth/callback')) {
        setCallbackUrl(url);
      }
    });

    return () => {
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    const processCallback = async () => {
      // Wait a bit for URL to be captured
      if (!callbackUrl) {
        const initialUrl = await Linking.getInitialURL();
        if (initialUrl && initialUrl.includes('auth/callback')) {
          setCallbackUrl(initialUrl);
          return;
        }
        // If still no URL after a moment, try with params
        setTimeout(() => {
          if (!callbackUrl) {
            processCallback();
          }
        }, 500);
        return;
      }

      try {
        const url = callbackUrl;

        // Try to get token and type from route params first (query params)
        let token = params.token as string | undefined;
        let type = params.type as string | undefined;

        // Supabase sends tokens in hash fragment (#access_token=...)
        // Extract hash fragment first, as that's where Supabase puts the auth data
        const hashIndex = url.indexOf('#');
        let hasAccessToken = false;

        if (hashIndex !== -1) {
          const hashFragment = url.substring(hashIndex + 1);
          const hashParams = new URLSearchParams(hashFragment);

          // Check if we have access_token (session already created by Supabase server)
          hasAccessToken = hashFragment.includes('access_token');

          // Supabase uses 'access_token' in hash fragment, but we need to verify with 'token'
          // The hash fragment contains: access_token, token_type, expires_in, refresh_token, type
          const accessToken = hashParams.get('access_token');
          type = type || hashParams.get('type') || undefined;

          // For verifyOtp, we might need the token from the hash or we can use the access_token
          // Actually, Supabase's verifyOtp expects the token from the email link, not access_token
          // The email link format is different - let's check if there's a 'token' param
          token = token || hashParams.get('token') || accessToken || undefined;
        }

        // Fallback: try query params (in case Supabase sends it that way)
        if (!token || !type) {
          const parsed = Linking.parse(url);
          token = token || (parsed.queryParams?.token as string | undefined);
          type = type || (parsed.queryParams?.type as string | undefined);
        }

        console.log('Auth callback - URL:', url);
        console.log('Auth callback - token:', token ? 'present' : 'missing', 'type:', type);
        console.log('Auth callback - hasAccessToken:', hasAccessToken);

        let sessionData: { session: any } | null = null;
        let sessionError: any = null;

        if (hasAccessToken) {
          // URL has access_token - Supabase should automatically extract session
          console.log('URL contains access_token, waiting for Supabase to process...');
          await new Promise(resolve => setTimeout(resolve, 500));
          const sessionResult = await supabase.auth.getSession();
          sessionData = sessionResult.data;
          sessionError = sessionResult.error;
        } else if (token && type) {
          // We have OTP token - need to verify it using verifyOtp
          console.log('Token found - verifying OTP with type:', type);

          try {
            // For email confirmation (signup/email type), verifyOtp should work with just token and type
            // The email parameter is optional for signup type
            const verifyParams: any = {
              type: type as 'signup' | 'email' | 'recovery' | 'magiclink' | 'email_change',
            };

            // For signup type, we can use token_hash or token
            // Try token_hash first (for email confirmation links)
            if (type === 'signup' || type === 'email') {
              verifyParams.token_hash = token;
            } else {
              verifyParams.token = token;
            }

            console.log('Calling verifyOtp with params:', { type: verifyParams.type, hasToken: !!verifyParams.token, hasTokenHash: !!verifyParams.token_hash });

            const { data: verifyData, error: verifyError } = await supabase.auth.verifyOtp(verifyParams);

            if (verifyError) {
              console.error('verifyOtp error:', verifyError);

              // If token_hash didn't work, try with regular token
              if (verifyParams.token_hash && (type === 'signup' || type === 'email')) {
                console.log('Retrying with token instead of token_hash...');
                delete verifyParams.token_hash;
                verifyParams.token = token;

                const retryResult = await supabase.auth.verifyOtp(verifyParams);
                if (retryResult.error) {
                  console.error('Retry verifyOtp error:', retryResult.error);
                  throw retryResult.error;
                }
              } else {
                throw verifyError;
              }
            }

            console.log('verifyOtp successful, getting session...');

            // Get session after verification
            await new Promise(resolve => setTimeout(resolve, 500));
            const sessionResult = await supabase.auth.getSession();
            sessionData = sessionResult.data;
            sessionError = sessionResult.error;

            if (!sessionData.session) {
              console.error('Session not created after verifyOtp - this should not happen');
            } else {
              console.log('Session created successfully after verifyOtp');
            }
          } catch (error: any) {
            console.error('Error verifying OTP:', error);
            console.error('Error details:', {
              message: error.message,
              status: error.status,
              name: error.name,
            });

            // Fallback: try getting session anyway
            const sessionResult = await supabase.auth.getSession();
            sessionData = sessionResult.data;
            sessionError = sessionResult.error;
          }
        } else {
          // No token, wait for Supabase to process URL
          console.log('No token found, waiting for Supabase to process URL...');
          await new Promise(resolve => setTimeout(resolve, 1000));
          const sessionResult = await supabase.auth.getSession();
          sessionData = sessionResult.data;
          sessionError = sessionResult.error;
        }

        // Session should already be set from above, but verify it exists

        if (sessionError || !sessionData.session) {
          console.error('Session error after verification:', sessionError);
          setStatus('error');
          setErrorMessage('Session was not created. Please try again.');
          setTimeout(() => {
            router.replace('/(auth)/sign-in');
          }, 2000);
          return;
        }

        console.log('Session created successfully, user ID:', sessionData.session.user.id);

        // Force refresh the user in AuthContext
        await refreshUser();

        // Also verify we can get the user directly
        const { data: { user: currentUser }, error: userError } = await supabase.auth.getUser();
        if (userError || !currentUser) {
          console.error('Error getting user after verification:', userError);
          setStatus('error');
          setErrorMessage('User was not found after verification.');
          setTimeout(() => {
            router.replace('/(auth)/sign-in');
          }, 2000);
          return;
        }

        console.log('User retrieved successfully:', currentUser.email);

        // Success - session is now created
        setStatus('success');
      } catch (error: any) {
        setStatus('error');
        setErrorMessage(error.message || 'An unexpected error occurred');
        setTimeout(() => {
          router.replace('/(auth)/sign-in');
        }, 2000);
      }
    };

    processCallback();
  }, [callbackUrl, params, router, refreshUser]);

  // Wait for user to be set in AuthContext before redirecting
  useEffect(() => {
    if (status === 'success') {
      if (user && !loading) {
        // User is now authenticated, redirect to tabs
        console.log('User authenticated, redirecting to tabs');
        router.replace('/(tabs)');
      } else if (!loading) {
        // If loading is done but user is still not set, wait a bit more and retry
        console.log('Waiting for user to be set in AuthContext...');
        const retryTimer = setTimeout(async () => {
          await refreshUser();
          const { data: { user: retryUser } } = await supabase.auth.getUser();
          if (retryUser) {
            console.log('User found on retry, redirecting');
            router.replace('/(tabs)');
          } else {
            console.error('User still not found after retry');
            setStatus('error');
            setErrorMessage('Failed to authenticate. Please try signing in.');
            setTimeout(() => {
              router.replace('/(auth)/sign-in');
            }, 2000);
          }
        }, 1000);
        return () => clearTimeout(retryTimer);
      }
    }
  }, [status, user, loading, router, refreshUser]);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.content}>
        {status === 'verifying' && (
          <Text style={styles.text}>Verifying your email...</Text>
        )}
        {status === 'success' && (
          <Text style={[styles.text, styles.successText]}>Email verified! Redirecting...</Text>
        )}
        {status === 'error' && (
          <>
            <Text style={[styles.text, styles.errorText]}>Verification failed</Text>
            <Text style={styles.errorMessage}>{errorMessage}</Text>
          </>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  text: {
    fontSize: 16,
    color: '#64748B',
  },
  successText: {
    color: '#10B981',
  },
  errorText: {
    color: '#DC2626',
    marginBottom: 8,
  },
  errorMessage: {
    fontSize: 14,
    color: '#64748B',
    textAlign: 'center',
    paddingHorizontal: 24,
  },
});



