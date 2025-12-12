import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { trackEvent } from '@/utils/analytics';
import { signInWithApple, signInWithGoogle } from '@/utils/auth';

interface LoginGateModalProps {
  visible: boolean;
  onDismiss: () => void;
  onLoginMethod: (method: 'email' | 'apple' | 'google') => void;
  onJustCopy?: () => void; // Optional - only shown if provided
  context?: 'save' | 'share'; // Context for the modal (save listing or share)
}

export function LoginGateModal({
  visible,
  onDismiss,
  onLoginMethod,
  onJustCopy,
  context = 'save',
}: LoginGateModalProps) {
  const router = useRouter();
  const [googleLoading, setGoogleLoading] = useState(false);
  const [appleLoading, setAppleLoading] = useState(false);

  // Track when modal is shown
  React.useEffect(() => {
    if (visible) {
      trackEvent('login_gate_shown', { context });
    }
  }, [visible, context]);

  const handleEmailLogin = () => {
    trackEvent('login_method_selected', { method: 'email', context });
    onLoginMethod('email');
    onDismiss();
    // Pass returnTo param so user can go back to preview screen
    router.push({
      pathname: '/(auth)/sign-in',
      params: { returnTo: '/(tabs)/listing-preview' },
    });
  };

  const handleAppleLogin = async () => {
    trackEvent('login_method_selected', { method: 'apple', context });
    onLoginMethod('apple');
    setAppleLoading(true);
    onDismiss(); // Dismiss modal immediately, OAuth flow will handle navigation

    const { data, error: appleError } = await signInWithApple();
    setAppleLoading(false);

    if (appleError) {
      // Don't show error if user cancelled
      if (appleError.message !== 'Sign in cancelled') {
        trackEvent('login_gate_oauth_failed', {
          method: 'apple',
          context,
          error: appleError.message || 'Unknown error',
        });
      } else {
        trackEvent('login_gate_oauth_cancelled', { method: 'apple', context });
      }
      return;
    }

    // OAuth flow completed - deep link handler will process the callback and navigate
    // For native Apple sign-in on iOS, if we have a user, navigate immediately
    if (data?.user) {
      trackEvent('login_gate_oauth_succeeded', { method: 'apple', context });
      // Navigation will be handled by auth state change in AuthContext
    } else {
      trackEvent('login_gate_oauth_succeeded', { method: 'apple', context });
      // Deep link handler will process the callback
    }
  };

  const handleGoogleLogin = async () => {
    trackEvent('login_method_selected', { method: 'google', context });
    onLoginMethod('google');
    setGoogleLoading(true);
    onDismiss(); // Dismiss modal immediately, OAuth flow will handle navigation

    const { data, error: googleError } = await signInWithGoogle();
    setGoogleLoading(false);

    if (googleError) {
      // Don't show error if user cancelled
      if (googleError.message !== 'Sign in cancelled') {
        trackEvent('login_gate_oauth_failed', {
          method: 'google',
          context,
          error: googleError.message || 'Unknown error',
        });
      } else {
        trackEvent('login_gate_oauth_cancelled', { method: 'google', context });
      }
      return;
    }

    // OAuth flow completed - deep link handler will process the callback and navigate
    trackEvent('login_gate_oauth_succeeded', { method: 'google', context });
  };

  const handleJustCopy = () => {
    if (onJustCopy) {
      onJustCopy();
    }
    onDismiss();
  };

  const handleCancel = () => {
    trackEvent('login_gate_dismissed', { context });
    onDismiss();
  };

  // Determine modal content based on context
  const headline = context === 'save'
    ? 'Save Your Listing'
    : 'Share Your Listing';

  const copy = context === 'save'
    ? 'Create a free account to save your listing and access it later from any device.'
    : 'Create a free account to share your listing and track how it performs.';

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onDismiss}>
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={onDismiss} />
        <SafeAreaView style={styles.modalContainer} edges={['bottom']}>
          <View style={styles.modal}>
            <Text style={styles.headline}>{headline}</Text>
            <Text style={styles.copy}>{copy}</Text>

            <View style={styles.buttons}>
              <Pressable
                onPress={handleEmailLogin}
                style={({ pressed }) => [
                  styles.primaryButton,
                  pressed && styles.primaryButtonPressed,
                ]}>
                <Text style={styles.primaryButtonText}>Continue with Email</Text>
              </Pressable>

              {Platform.OS === 'ios' && (
                <Pressable
                  onPress={handleAppleLogin}
                  disabled={googleLoading || appleLoading}
                  style={({ pressed }) => [
                    styles.secondaryButton,
                    (googleLoading || appleLoading || pressed) && styles.secondaryButtonPressed,
                  ]}>
                  <Text style={styles.secondaryButtonText}>
                    {appleLoading ? 'Signing in...' : 'Continue with Apple'}
                  </Text>
                </Pressable>
              )}

              <Pressable
                onPress={handleGoogleLogin}
                disabled={googleLoading || appleLoading}
                style={({ pressed }) => [
                  styles.secondaryButton,
                  (googleLoading || appleLoading || pressed) && styles.secondaryButtonPressed,
                ]}>
                <Text style={styles.secondaryButtonText}>
                  {googleLoading ? 'Signing in...' : 'Continue with Google'}
                </Text>
              </Pressable>
            </View>

            {onJustCopy && (
              <Pressable onPress={handleJustCopy} style={styles.dismissLink}>
                <Text style={styles.dismissLinkText}>Just Copy Text</Text>
              </Pressable>
            )}

            <Pressable onPress={handleCancel} style={styles.cancelLink}>
              <Text style={styles.cancelLinkText}>Not now</Text>
            </Pressable>

            <View style={styles.footer}>
              <Text style={styles.footerText}>
                By continuing, you agree to our{' '}
                <Text style={styles.footerLink}>Terms of Service</Text> and{' '}
                <Text style={styles.footerLink}>Privacy Policy</Text>
              </Text>
            </View>
          </View>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  modalContainer: {
    justifyContent: 'flex-end',
  },
  modal: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 32,
    maxHeight: '80%',
  },
  headline: {
    fontSize: 24,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 12,
    textAlign: 'center',
  },
  copy: {
    fontSize: 16,
    color: '#64748B',
    lineHeight: 22,
    marginBottom: 24,
    textAlign: 'center',
  },
  buttons: {
    gap: 12,
    marginBottom: 16,
  },
  primaryButton: {
    backgroundColor: '#0F172A',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  primaryButtonPressed: {
    opacity: 0.85,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  secondaryButton: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
  },
  secondaryButtonPressed: {
    backgroundColor: '#F1F5F9',
  },
  secondaryButtonText: {
    color: '#0F172A',
    fontSize: 16,
    fontWeight: '600',
  },
  dismissLink: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  dismissLinkText: {
    color: '#64748B',
    fontSize: 14,
    fontWeight: '500',
  },
  cancelLink: {
    paddingVertical: 8,
    alignItems: 'center',
    marginTop: 4,
  },
  cancelLinkText: {
    color: '#94A3B8',
    fontSize: 14,
    fontWeight: '400',
  },
  footer: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
  footerText: {
    fontSize: 12,
    color: '#94A3B8',
    textAlign: 'center',
    lineHeight: 18,
  },
  footerLink: {
    color: '#4338CA',
    textDecorationLine: 'underline',
  },
});
