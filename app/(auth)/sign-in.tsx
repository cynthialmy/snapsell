import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import {
    Alert,
    KeyboardAvoidingView,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { trackEvent } from '@/utils/analytics';
import { signIn, signInWithApple, signInWithGoogle, signInWithMagicLink } from '@/utils/auth';

export default function SignInScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ returnTo?: string }>();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [magicLinkLoading, setMagicLinkLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [appleLoading, setAppleLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      // trackScreenView('sign-in', { has_return_to: !!params.returnTo }); // Disabled - overloading activities
    }, [params.returnTo])
  );

  const handleSignIn = async () => {
    if (!email || !password) {
      setError('Please enter both email and password');
      return;
    }

    setLoading(true);
    setError(null);
    trackEvent('sign_in_attempted', { method: 'email_password' });

    const { data, error: signInError } = await signIn(email, password);

    if (signInError) {
      trackEvent('sign_in_failed', {
        method: 'email_password',
        error: signInError.message || 'Unknown error',
      });
      setError(signInError.message || 'Failed to sign in. Please try again.');
      setLoading(false);
      return;
    }

    if (data?.user) {
      trackEvent('sign_in_succeeded', { method: 'email_password' });
      // If we came from listing preview, go back there; otherwise go to tabs
      if (params.returnTo) {
        router.replace(params.returnTo as any);
      } else {
        router.replace('/(tabs)');
      }
    }
  };

  const handleMagicLink = async () => {
    if (!email) {
      setError('Please enter your email address');
      return;
    }

    setMagicLinkLoading(true);
    setError(null);
    trackEvent('magic_link_requested', { email_provided: !!email });

    const { data, error: magicLinkError } = await signInWithMagicLink(email);

    if (magicLinkError) {
      trackEvent('magic_link_failed', {
        error: magicLinkError.message || 'Unknown error',
      });
      setError(magicLinkError.message || 'Failed to send magic link. Please try again.');
      setMagicLinkLoading(false);
      return;
    }

    if (data) {
      trackEvent('magic_link_requested', { success: true });
      Alert.alert(
        'Check your email',
        'We sent you a magic link. Click the link in the email to sign in.',
        [{ text: 'OK', onPress: () => router.push('/(auth)/magic-link') }]
      );
    }
  };

  const handleGoogleSignIn = async () => {
    setGoogleLoading(true);
    setError(null);
    trackEvent('sign_in_attempted', { method: 'google' });

    const { data, error: googleError } = await signInWithGoogle();

    setGoogleLoading(false);

    if (googleError) {
      // Don't show error if user cancelled
      if (googleError.message !== 'Sign in cancelled') {
        trackEvent('sign_in_failed', {
          method: 'google',
          error: googleError.message || 'Unknown error',
        });
        setError(googleError.message || 'Failed to sign in with Google. Please try again.');
      } else {
        trackEvent('sign_in_cancelled', { method: 'google' });
      }
      return;
    }

    // Check if we have a user/session from OAuth
    if (data?.user || data?.session) {
      trackEvent('sign_in_succeeded', { method: 'google' });
      // Navigate to home screen
      if (params.returnTo) {
        router.replace(params.returnTo as any);
      } else {
        router.replace('/(tabs)');
      }
    } else {
      // OAuth flow completed but no session yet - deep link handler should process it
      // Wait a moment and check session
      setTimeout(async () => {
        const { getUser } = await import('@/utils/auth');
        const { user } = await getUser();
        if (user) {
          trackEvent('sign_in_succeeded', { method: 'google' });
          if (params.returnTo) {
            router.replace(params.returnTo as any);
          } else {
            router.replace('/(tabs)');
          }
        } else {
          // Session still not set, show error
          setError('Sign in completed but session was not created. Please try again.');
        }
      }, 1000);
    }
  };

  const handleAppleSignIn = async () => {
    setAppleLoading(true);
    setError(null);
    trackEvent('sign_in_attempted', { method: 'apple' });

    const { data, error: appleError } = await signInWithApple();

    setAppleLoading(false);

    if (appleError) {
      // Don't show error if user cancelled
      if (appleError.message !== 'Sign in cancelled') {
        trackEvent('sign_in_failed', {
          method: 'apple',
          error: appleError.message || 'Unknown error',
        });
        setError(appleError.message || 'Failed to sign in with Apple. Please try again.');
      } else {
        trackEvent('sign_in_cancelled', { method: 'apple' });
      }
      return;
    }

    // Check if we have a user/session from OAuth
    if (data?.user || data?.session) {
      trackEvent('sign_in_succeeded', { method: 'apple' });
      // Navigate to home screen
      if (params.returnTo) {
        router.replace(params.returnTo as any);
      } else {
        router.replace('/(tabs)');
      }
    } else {
      // OAuth flow completed but no session yet - deep link handler should process it
      // Wait a moment and check session
      setTimeout(async () => {
        const { getUser } = await import('@/utils/auth');
        const { user } = await getUser();
        if (user) {
          trackEvent('sign_in_succeeded', { method: 'apple' });
          if (params.returnTo) {
            router.replace(params.returnTo as any);
          } else {
            router.replace('/(tabs)');
          }
        } else {
          // Session still not set, show error
          setError('Sign in completed but session was not created. Please try again.');
        }
      }, 1000);
    }
  };

  const handleClose = () => {
    // If there's a returnTo param, go to that route
    if (params.returnTo) {
      router.replace(params.returnTo as any);
    } else {
      // Otherwise, go to tabs index (home screen)
      router.replace('/(tabs)');
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboardView}>
        <View style={styles.header}>
          <Pressable onPress={handleClose} style={styles.closeButton}>
            <Text style={styles.closeButtonText}>✕</Text>
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.title}>Welcome</Text>
          <Text style={styles.subtitle}>Sign in to continue</Text>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <View style={styles.form}>
            <View style={styles.field}>
              <Text style={styles.label}>Email</Text>
              <TextInput
                value={email}
                onChangeText={setEmail}
                placeholder="you@example.com"
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
                style={styles.input}
                editable={!loading && !magicLinkLoading && !googleLoading && !appleLoading}
              />
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Password</Text>
              <TextInput
                value={password}
                onChangeText={setPassword}
                placeholder="Enter your password"
                secureTextEntry
                autoCapitalize="none"
                autoComplete="password"
                style={styles.input}
                editable={!loading && !magicLinkLoading && !googleLoading && !appleLoading}
              />
            </View>

            <Pressable
              onPress={handleSignIn}
              disabled={loading || magicLinkLoading || googleLoading || appleLoading}
              style={({ pressed }) => [
                styles.primaryButton,
                (loading || magicLinkLoading || googleLoading || appleLoading || pressed) && styles.primaryButtonDisabled,
              ]}>
              <Text style={styles.primaryButtonText}>
                {loading ? 'Signing in...' : 'Sign in'}
              </Text>
            </Pressable>

            <View style={styles.divider}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>or</Text>
              <View style={styles.dividerLine} />
            </View>

            <Pressable
              onPress={handleGoogleSignIn}
              disabled={loading || magicLinkLoading || googleLoading || appleLoading}
              style={({ pressed }) => [
                styles.oauthButton,
                (loading || magicLinkLoading || googleLoading || appleLoading || pressed) && styles.oauthButtonDisabled,
              ]}>
              <Text style={styles.oauthButtonText}>
                {googleLoading ? 'Signing in...' : 'Continue with Google'}
              </Text>
            </Pressable>

            {Platform.OS === 'ios' && (
              <Pressable
                onPress={handleAppleSignIn}
                disabled={loading || magicLinkLoading || googleLoading || appleLoading}
                style={({ pressed }) => [
                  styles.oauthButton,
                  (loading || magicLinkLoading || googleLoading || appleLoading || pressed) && styles.oauthButtonDisabled,
                ]}>
                <Text style={styles.oauthButtonText}>
                  {appleLoading ? 'Signing in...' : 'Continue with Apple'}
                </Text>
              </Pressable>
            )}

            <Pressable
              onPress={handleMagicLink}
              disabled={loading || magicLinkLoading || googleLoading || appleLoading}
              style={({ pressed }) => [
                styles.secondaryButton,
                (loading || magicLinkLoading || googleLoading || appleLoading || pressed) && styles.secondaryButtonDisabled,
              ]}>
              <Text style={styles.secondaryButtonText}>
                {magicLinkLoading ? 'Sending...' : 'Sign in with magic link'}
              </Text>
            </Pressable>

            <View style={styles.footer}>
              <Text style={styles.footerText}>Don't have an account? </Text>
              <Pressable onPress={() => router.push('/(auth)/sign-up')}>
                <Text style={styles.footerLink}>Sign up</Text>
              </Pressable>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  keyboardView: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 8,
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeButtonText: {
    fontSize: 18,
    color: '#64748B',
    fontWeight: '600',
  },
  content: {
    padding: 24,
    paddingTop: 24,
  },
  title: {
    fontSize: 32,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#64748B',
    marginBottom: 32,
  },
  error: {
    color: '#DC2626',
    fontSize: 14,
    marginBottom: 16,
    padding: 12,
    backgroundColor: '#FEE2E2',
    borderRadius: 8,
  },
  form: {
    gap: 16,
  },
  field: {
    gap: 8,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#475569',
  },
  input: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: '#0F172A',
    backgroundColor: '#F8FAFC',
  },
  primaryButton: {
    backgroundColor: '#0F172A',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  primaryButtonDisabled: {
    opacity: 0.5,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 8,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#E2E8F0',
  },
  dividerText: {
    marginHorizontal: 16,
    color: '#64748B',
    fontSize: 14,
  },
  secondaryButton: {
    borderWidth: 1,
    borderColor: '#CBD5F5',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    backgroundColor: '#EEF2FF',
  },
  secondaryButtonDisabled: {
    opacity: 0.5,
  },
  secondaryButtonText: {
    color: '#4338CA',
    fontSize: 16,
    fontWeight: '600',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 24,
  },
  footerText: {
    color: '#64748B',
    fontSize: 14,
  },
  footerLink: {
    color: '#4338CA',
    fontSize: 14,
    fontWeight: '600',
  },
  oauthButton: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
  },
  oauthButtonDisabled: {
    opacity: 0.5,
  },
  oauthButtonText: {
    color: '#0F172A',
    fontSize: 16,
    fontWeight: '600',
  },
});
