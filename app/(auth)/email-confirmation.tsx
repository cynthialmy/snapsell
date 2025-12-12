import * as Linking from 'expo-linking';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/contexts/AuthContext';
import { trackScreenView } from '@/utils/analytics';

export default function EmailConfirmationScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { user } = useAuth();
  const [email, setEmail] = useState<string>('');

  useFocusEffect(
    useCallback(() => {
      trackScreenView('email-confirmation');
    }, [])
  );

  useEffect(() => {
    // Check if we have an email in params
    if (params.email) {
      setEmail(params.email as string);
    }
  }, [params]);

  useEffect(() => {
    // If user is authenticated (after clicking confirmation link), redirect to home
    if (user) {
      // Try to dismiss modals, but don't fail if there's nothing to dismiss
      try {
        router.dismissAll();
      } catch (e) {
        // Ignore dismiss errors - replace will handle navigation
      }
      router.replace('/(tabs)');
    }
  }, [user, router]);

  useEffect(() => {
    // Listen for deep link callbacks
    const subscription = Linking.addEventListener('url', (event) => {
      const { path } = Linking.parse(event.url);
      if (path === 'auth/callback') {
        // Auth callback - user will be set by AuthContext
        // Just wait for the redirect
      }
    });

    return () => {
      subscription.remove();
    };
  }, []);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.content}>
        <Text style={styles.title}>Check your email</Text>
        <Text style={styles.subtitle}>
          We sent a confirmation link to {email || 'your email address'}
        </Text>
        <Text style={styles.instructions}>
          Please check your email and click the confirmation link to verify your account. The link will open this app automatically and sign you in.
        </Text>
        <Text style={styles.note}>
          Didn't receive the email? Check your spam folder or try signing up again.
        </Text>
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
    padding: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 16,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: '#64748B',
    marginBottom: 24,
    textAlign: 'center',
  },
  instructions: {
    fontSize: 14,
    color: '#475569',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 16,
  },
  note: {
    fontSize: 12,
    color: '#94A3B8',
    textAlign: 'center',
    fontStyle: 'italic',
  },
});
