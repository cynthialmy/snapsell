import { useRouter } from 'expo-router';
import { useState, useEffect } from 'react';
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
import { signOut, getUserProfile, updateUserProfile } from '@/utils/auth';

export default function ProfileScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [displayName, setDisplayName] = useState('');
  const [loading, setLoading] = useState(false);
  const [profileLoading, setProfileLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadProfile();
  }, [user]);

  const loadProfile = async () => {
    if (!user) return;

    setProfileLoading(true);
    const { profile, error: profileError } = await getUserProfile();

    if (profileError) {
      // If profile doesn't exist, that's okay - we'll create it on update
      console.log('Profile not found, will create on update');
    }

    if (profile) {
      setDisplayName(profile.display_name || user.email?.split('@')[0] || '');
    } else {
      setDisplayName(user.email?.split('@')[0] || '');
    }

    setProfileLoading(false);
  };

  const handleUpdateProfile = async () => {
    if (!user) return;

    setLoading(true);
    setError(null);

    const { profile, error: updateError } = await updateUserProfile({
      display_name: displayName || undefined,
    });

    if (updateError) {
      setError(updateError.message || 'Failed to update profile');
      setLoading(false);
      return;
    }

    Alert.alert('Success', 'Profile updated successfully');
    setLoading(false);
  };

  const handleSignOut = async () => {
    Alert.alert(
      'Sign out',
      'Are you sure you want to sign out?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign out',
          style: 'destructive',
          onPress: async () => {
            await signOut();
            router.replace('/(auth)/sign-in');
          },
        },
      ]
    );
  };

  if (profileLoading) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Loading profile...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboardView}>
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.title}>Profile</Text>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <View style={styles.form}>
            <View style={styles.field}>
              <Text style={styles.label}>Email</Text>
              <TextInput
                value={user?.email || ''}
                editable={false}
                style={[styles.input, styles.inputDisabled]}
              />
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Display Name</Text>
              <TextInput
                value={displayName}
                onChangeText={setDisplayName}
                placeholder="Your name"
                autoCapitalize="words"
                style={styles.input}
                editable={!loading}
              />
            </View>

            <Pressable
              onPress={handleUpdateProfile}
              disabled={loading}
              style={({ pressed }) => [
                styles.primaryButton,
                (loading || pressed) && styles.primaryButtonDisabled,
              ]}>
              <Text style={styles.primaryButtonText}>
                {loading ? 'Updating...' : 'Update profile'}
              </Text>
            </Pressable>
          </View>

          <View style={styles.section}>
            <Pressable
              onPress={() => router.push('/(tabs)/settings')}
              style={styles.sectionButton}>
              <Text style={styles.sectionButtonText}>Settings</Text>
              <Text style={styles.sectionButtonArrow}>→</Text>
            </Pressable>
          </View>

          <View style={styles.signOutSection}>
            <Pressable onPress={handleSignOut} style={styles.signOutButton}>
              <Text style={styles.signOutButtonText}>Sign out</Text>
            </Pressable>
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
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 16,
    color: '#64748B',
  },
  content: {
    padding: 24,
  },
  title: {
    fontSize: 32,
    fontWeight: '700',
    color: '#0F172A',
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
    marginBottom: 32,
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
  inputDisabled: {
    backgroundColor: '#F1F5F9',
    color: '#64748B',
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
  section: {
    marginTop: 24,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    paddingTop: 16,
  },
  sectionButton: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
  },
  sectionButtonText: {
    fontSize: 16,
    color: '#0F172A',
  },
  sectionButtonArrow: {
    fontSize: 16,
    color: '#64748B',
  },
  signOutSection: {
    marginTop: 32,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    paddingTop: 16,
  },
  signOutButton: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  signOutButtonText: {
    fontSize: 16,
    color: '#DC2626',
    fontWeight: '600',
  },
});
