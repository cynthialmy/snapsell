import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { trackEvent } from '@/utils/analytics';

interface SaveSlotsPaywallProps {
  visible: boolean;
  limit: number;
  onBuySlots: () => void;
  onGoUnlimited: () => void;
  onDismiss?: () => void;
}

export function SaveSlotsPaywall({
  visible,
  limit,
  onBuySlots,
  onGoUnlimited,
  onDismiss,
}: SaveSlotsPaywallProps) {
  // Track when paywall is shown
  React.useEffect(() => {
    if (visible) {
      trackEvent('save_slots_paywall_shown', { limit });
    }
  }, [visible, limit]);

  const handleBuySlots = () => {
    trackEvent('save_slots_paywall_buy_slots', { limit });
    onBuySlots();
  };

  const handleGoUnlimited = () => {
    trackEvent('save_slots_paywall_go_unlimited', { limit });
    onGoUnlimited();
  };

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
            <Text style={styles.emoji}>🦦</Text>
            <Text style={styles.headline}>You've used all {limit} free Save Slots!</Text>
            <Text style={styles.copy}>
              Unlock more to keep growing your resale pile. Creating listings is always free — Save Slots are only used when you save a listing.
            </Text>

            <View style={styles.buttons}>
              <Pressable
                onPress={handleBuySlots}
                style={({ pressed }) => [
                  styles.primaryButton,
                  pressed && styles.primaryButtonPressed,
                ]}>
                <Text style={styles.primaryButtonText}>Buy 10 Save Slots</Text>
              </Pressable>

              <Pressable
                onPress={handleGoUnlimited}
                style={({ pressed }) => [
                  styles.secondaryButton,
                  pressed && styles.secondaryButtonPressed,
                ]}>
                <Text style={styles.secondaryButtonText}>Go Unlimited</Text>
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
    fontSize: 48,
    marginBottom: 12,
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
    width: '100%',
    gap: 12,
  },
  primaryButton: {
    backgroundColor: '#4338CA',
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
});




