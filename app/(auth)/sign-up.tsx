import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
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

import { useAuth } from '@/contexts/AuthContext';
import { trackEvent, trackScreenView } from '@/utils/analytics';
import { signInWithApple, signInWithGoogle, signUp } from '@/utils/auth';

export default function SignUpScreen() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [appleLoading, setAppleLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      trackScreenView('sign-up');
    }, [])
  );

  // Reset loading state when user becomes authenticated (e.g., after email confirmation)
  useEffect(() => {
    if (user && loading) {
      setLoading(false);
    }
  }, [user, loading]);

  const handleSignUp = async () => {
    if (!email || !password) {
      setError('Please enter both email and password');
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    setLoading(true);
    setError(null);
    trackEvent('sign_up_attempted', { has_display_name: !!displayName });

    const { data, error: signUpError } = await signUp(email, password, displayName || undefined);

    if (signUpError) {
      trackEvent('sign_up_failed', {
        error: signUpError.message || 'Unknown error',
      });
      setError(signUpError.message || 'Failed to sign up. Please try again.');
      setLoading(false);
      return;
    }

    if (data?.user) {
      // Check if email confirmation is required
      // If session is null but user exists, email confirmation is needed
      if (!data.session) {
        trackEvent('sign_up_succeeded', { email_confirmation_required: true });
        // Reset loading state before navigating
        setLoading(false);
        // Navigate to email confirmation screen
        router.push({
          pathname: '/(auth)/email-confirmation',
          params: { email },
        });
      } else {
        trackEvent('sign_up_succeeded', { email_confirmation_required: false });
        // Email confirmation not required, user is already signed in
        setLoading(false);
        Alert.alert(
          'Account created',
          'Your account has been created successfully!',
          [{ text: 'OK', onPress: () => router.replace('/(tabs)') }]
        );
      }
    } else {
      // No user data returned, reset loading
      setLoading(false);
    }
  };

  const handleGoogleSignUp = async () => {
    setGoogleLoading(true);
    setError(null);
    trackEvent('sign_up_attempted', { method: 'google' });

    const { data, error: googleError } = await signInWithGoogle();

    setGoogleLoading(false);

    if (googleError) {
      // Don't show error if user cancelled
      if (googleError.message !== 'Sign in cancelled') {
        trackEvent('sign_up_failed', {
          method: 'google',
          error: googleError.message || 'Unknown error',
        });
        setError(googleError.message || 'Failed to sign up with Google. Please try again.');
      } else {
        trackEvent('sign_up_cancelled', { method: 'google' });
      }
      return;
    }

    // Check if we have a user/session from OAuth
    if (data?.user || data?.session) {
      trackEvent('sign_up_succeeded', { method: 'google' });
      Alert.alert(
        'Account created',
        'Your account has been created successfully!',
        [{ text: 'OK', onPress: () => router.replace('/(tabs)') }]
      );
    } else {
      // OAuth flow completed but no session yet - deep link handler should process it
      // Wait a moment and check session
      setTimeout(async () => {
        const { getUser } = await import('@/utils/auth');
        const { user } = await getUser();
        if (user) {
          trackEvent('sign_up_succeeded', { method: 'google' });
          Alert.alert(
            'Account created',
            'Your account has been created successfully!',
            [{ text: 'OK', onPress: () => router.replace('/(tabs)') }]
          );
        } else {
          // Session still not set, show error
          setError('Sign up completed but session was not created. Please try signing in again.');
        }
      }, 1000);
    }
  };

  const handleAppleSignUp = async () => {
    setAppleLoading(true);
    setError(null);
    trackEvent('sign_up_attempted', { method: 'apple' });

    const { data, error: appleError } = await signInWithApple();

    setAppleLoading(false);

    if (appleError) {
      // Don't show error if user cancelled
      if (appleError.message !== 'Sign in cancelled') {
        trackEvent('sign_up_failed', {
          method: 'apple',
          error: appleError.message || 'Unknown error',
        });
        setError(appleError.message || 'Failed to sign up with Apple. Please try again.');
      } else {
        trackEvent('sign_up_cancelled', { method: 'apple' });
      }
      return;
    }

    // Check if we have a user/session from OAuth
    if (data?.user || data?.session) {
      trackEvent('sign_up_succeeded', { method: 'apple' });
      Alert.alert(
        'Account created',
        'Your account has been created successfully!',
        [{ text: 'OK', onPress: () => router.replace('/(tabs)') }]
      );
    } else {
      // OAuth flow completed but no session yet - deep link handler should process it
      // Wait a moment and check session
      setTimeout(async () => {
        const { getUser } = await import('@/utils/auth');
        const { user } = await getUser();
        if (user) {
          trackEvent('sign_up_succeeded', { method: 'apple' });
          Alert.alert(
            'Account created',
            'Your account has been created successfully!',
            [{ text: 'OK', onPress: () => router.replace('/(tabs)') }]
          );
        } else {
          // Session still not set, show error
          setError('Sign up completed but session was not created. Please try signing in again.');
        }
      }, 1000);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboardView}>
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.title}>Create account</Text>
          <Text style={styles.subtitle}>Sign up to get started</Text>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <View style={styles.form}>
            <View style={styles.field}>
              <Text style={styles.label}>Display Name (optional)</Text>
              <TextInput
                value={displayName}
                onChangeText={setDisplayName}
                placeholder="Your name"
                autoCapitalize="words"
                style={styles.input}
                editable={!loading && !googleLoading && !appleLoading}
              />
            </View>

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
                editable={!loading && !googleLoading && !appleLoading}
              />
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Password</Text>
              <TextInput
                value={password}
                onChangeText={setPassword}
                placeholder="At least 6 characters"
                secureTextEntry
                autoCapitalize="none"
                autoComplete="password-new"
                style={styles.input}
                editable={!loading && !googleLoading && !appleLoading}
              />
            </View>

            <Pressable
              onPress={handleSignUp}
              disabled={loading || googleLoading || appleLoading}
              style={({ pressed }) => [
                styles.primaryButton,
                (loading || googleLoading || appleLoading || pressed) && styles.primaryButtonDisabled,
              ]}>
              <Text style={styles.primaryButtonText}>
                {loading ? 'Creating account...' : 'Sign up'}
              </Text>
            </Pressable>

            <View style={styles.divider}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>or</Text>
              <View style={styles.dividerLine} />
            </View>

            <Pressable
              onPress={handleGoogleSignUp}
              disabled={loading || googleLoading || appleLoading}
              style={({ pressed }) => [
                styles.oauthButton,
                (loading || googleLoading || appleLoading || pressed) && styles.oauthButtonDisabled,
              ]}>
              <Text style={styles.oauthButtonText}>
                {googleLoading ? 'Signing up...' : 'Continue with Google'}
              </Text>
            </Pressable>

            {Platform.OS === 'ios' && (
              <Pressable
                onPress={handleAppleSignUp}
                disabled={loading || googleLoading || appleLoading}
                style={({ pressed }) => [
                  styles.oauthButton,
                  (loading || googleLoading || appleLoading || pressed) && styles.oauthButtonDisabled,
                ]}>
                <Text style={styles.oauthButtonText}>
                  {appleLoading ? 'Signing up...' : 'Continue with Apple'}
                </Text>
              </Pressable>
            )}

            <View style={styles.footer}>
              <Text style={styles.footerText}>Already have an account? </Text>
              <Pressable onPress={() => router.push('/(auth)/sign-in')}>
                <Text style={styles.footerLink}>Sign in</Text>
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
  content: {
    padding: 24,
    paddingTop: 48,
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
