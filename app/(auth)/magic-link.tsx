import * as Linking from 'expo-linking';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/contexts/AuthContext';
// import { trackScreenView } from '@/utils/analytics'; // Disabled - overloading activities

export default function MagicLinkScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { user } = useAuth();
  const [email, setEmail] = useState<string>('');

  useFocusEffect(
    useCallback(() => {
      // trackScreenView('magic-link'); // Disabled - overloading activities
    }, [])
  );

  useEffect(() => {
    // Check if we have an email in params
    if (params.email) {
      setEmail(params.email as string);
    }
  }, [params]);

  useEffect(() => {
    // If user is authenticated, redirect to home
    if (user) {
      router.replace('/(tabs)');
    }
  }, [user, router]);

  useEffect(() => {
    // Listen for deep link callbacks
    const subscription = Linking.addEventListener('url', (event) => {
      const { path, queryParams } = Linking.parse(event.url);
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
          We sent a magic link to {email || 'your email address'}
        </Text>
        <Text style={styles.instructions}>
          Click the link in the email to sign in. The link will open this app automatically.
        </Text>
        <Text style={styles.note}>
          Didn't receive the email? Check your spam folder or try again.
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
