import * as Linking from 'expo-linking';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
    Alert,
    Modal,
    Pressable,
    StyleSheet,
    Text,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/contexts/AuthContext';
import { trackEvent } from '@/utils/analytics';
import { initiatePackPurchase } from '@/utils/payments';

interface BlockedQuotaModalProps {
  visible: boolean;
  type: 'creation' | 'save';
  creationsRemaining?: number;
  saveSlotsRemaining?: number;
  creationsDailyLimit?: number;
  freeSaveSlots?: number;
  onDismiss: () => void;
  onPurchaseSuccess?: () => void;
}

export function BlockedQuotaModal({
  visible,
  type,
  creationsRemaining = 0,
  saveSlotsRemaining = 0,
  creationsDailyLimit = 10,
  freeSaveSlots = 10,
  onDismiss,
  onPurchaseSuccess,
}: BlockedQuotaModalProps) {
  const router = useRouter();
  const { user } = useAuth();
  const [processing, setProcessing] = useState(false);

  // Track when modal is shown
  React.useEffect(() => {
    if (visible) {
      trackEvent(type === 'creation' ? 'generate_blocked_no_quota' : 'save_blocked_no_quota', {
        creations_remaining: creationsRemaining,
        save_slots_remaining: saveSlotsRemaining,
      });
    }
  }, [visible, type, creationsRemaining, saveSlotsRemaining]);

  // Reset processing state when modal closes
  React.useEffect(() => {
    if (!visible) {
      setProcessing(false);
    }
  }, [visible]);

  const handleBuyPack = async (sku: 'credits_10' | 'credits_25' | 'credits_60') => {
    if (!user) {
      Alert.alert(
        'Account required',
        'You need to create an account to purchase packs. Sign in to continue.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Sign In',
            onPress: () => {
              onDismiss();
              router.push('/(auth)/sign-in');
            },
          },
        ]
      );
      return;
    }

    setProcessing(true);
    try {
      trackEvent('tap_buy_pack', { sku });

      const deepLinkScheme = process.env.EXPO_PUBLIC_DEEP_LINK_SCHEME || 'snapsell';
      const successUrl = `${deepLinkScheme}://payment/success?session_id={CHECKOUT_SESSION_ID}`;
      const cancelUrl = `${deepLinkScheme}://payment/cancel`;

      const { checkout_url } = await initiatePackPurchase(sku, {
        successUrl,
        cancelUrl,
      });

      const canOpen = await Linking.canOpenURL(checkout_url);
      if (canOpen) {
        await Linking.openURL(checkout_url);
        onDismiss();
        Alert.alert(
          'Payment Started',
          'Complete your payment in the browser. You will be redirected back to the app when payment is complete.',
          [{ text: 'OK' }]
        );
      } else {
        Alert.alert('Error', 'Cannot open payment URL');
      }
    } catch (error: any) {
      trackEvent('pack_purchase_failed', {
        sku,
        error: error.message || 'Unknown error',
      });
      Alert.alert('Error', error.message || 'Failed to start payment. Please try again.');
    } finally {
      setProcessing(false);
    }
  };

  const handleUpgradeToPro = () => {
    trackEvent('tap_upgrade_to_pro', { context: 'blocked_quota_modal', type });
    onDismiss();
    router.push('/(tabs)/upgrade');
  };

  const getTitle = () => {
    if (type === 'creation') {
      return `All out — amazing work! 🦦`;
    }
    return `All out — amazing work! 🦦`;
  };

  const getBody = () => {
    if (type === 'creation') {
      return `You've used all ${creationsDailyLimit} free creations today. Buy a pack or upgrade to Pro.`;
    }
    return `You've used all ${freeSaveSlots} Save Slots. Buy a pack or upgrade to Pro.`;
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onDismiss}
      statusBarTranslucent>
      <View style={styles.overlay}>
        <Pressable
          style={styles.backdrop}
          onPress={() => {
            trackEvent('blocked_quota_modal_dismissed', { type, action: 'backdrop' });
            onDismiss();
          }}
        />
        <SafeAreaView style={styles.modalContainer} edges={['bottom']}>
          <View style={styles.modal}>
            <Text style={styles.emoji}>🦦</Text>
            <Text style={styles.title}>{getTitle()}</Text>
            <Text style={styles.body}>{getBody()}</Text>
            <Text style={styles.microcopy}>
              Creation and saves both refill with packs. Copying is always free.
            </Text>

            <View style={styles.buttons}>
              <Pressable
                onPress={() => handleBuyPack('credits_25')}
                disabled={processing}
                style={({ pressed }) => [
                  styles.primaryButton,
                  (processing || pressed) && styles.primaryButtonDisabled,
                ]}>
                <Text style={styles.primaryButtonText}>
                  {processing ? 'Processing...' : 'Buy 25-Pack (+25 creations & +25 saves) — $5.99'}
                </Text>
                <Text style={styles.primaryButtonSubtext}>Most popular</Text>
              </Pressable>

              <Pressable
                onPress={handleUpgradeToPro}
                disabled={processing}
                style={({ pressed }) => [
                  styles.secondaryButton,
                  (processing || pressed) && styles.secondaryButtonDisabled,
                ]}>
                <Text style={styles.secondaryButtonText}>Upgrade to Pro (unlimited)</Text>
              </Pressable>

              <Pressable
                onPress={() => {
                  trackEvent('blocked_quota_modal_dismissed', { type, action: 'come_back_tomorrow' });
                  onDismiss();
                }}
                disabled={processing}
                style={({ pressed }) => [
                  styles.tertiaryButton,
                  pressed && styles.tertiaryButtonPressed,
                ]}>
                <Text style={styles.tertiaryButtonText}>Come back tomorrow</Text>
              </Pressable>
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
    justifyContent: 'center',
    alignItems: 'center',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  modalContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
  },
  modal: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 24,
    width: '85%',
    maxWidth: 400,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 8,
    alignItems: 'center',
  },
  emoji: {
    fontSize: 64,
    marginBottom: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 12,
    textAlign: 'center',
  },
  body: {
    fontSize: 16,
    color: '#64748B',
    lineHeight: 22,
    marginBottom: 8,
    textAlign: 'center',
  },
  microcopy: {
    fontSize: 12,
    color: '#94A3B8',
    marginBottom: 24,
    textAlign: 'center',
    fontStyle: 'italic',
  },
  buttons: {
    width: '100%',
    gap: 12,
  },
  primaryButton: {
    backgroundColor: '#4338CA',
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 12,
    alignItems: 'center',
  },
  primaryButtonDisabled: {
    opacity: 0.5,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  primaryButtonSubtext: {
    color: '#C7D2FE',
    fontSize: 12,
    fontWeight: '500',
  },
  secondaryButton: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
  },
  secondaryButtonDisabled: {
    opacity: 0.5,
  },
  secondaryButtonText: {
    color: '#0F172A',
    fontSize: 16,
    fontWeight: '600',
  },
  tertiaryButton: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  tertiaryButtonPressed: {
    opacity: 0.7,
  },
  tertiaryButtonText: {
    color: '#64748B',
    fontSize: 14,
    fontWeight: '500',
  },
});
