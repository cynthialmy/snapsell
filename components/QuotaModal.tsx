import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { trackEvent } from '@/utils/analytics';

interface QuotaModalProps {
  visible: boolean;
  count: number;
  period: string;
  onUpgrade: () => void;
  onContinueFree: () => void;
  onDismiss: () => void;
}

export function QuotaModal({
  visible,
  count,
  period,
  onUpgrade,
  onContinueFree,
  onDismiss,
}: QuotaModalProps) {
  // Track when modal is shown
  React.useEffect(() => {
    if (visible) {
      trackEvent('quota_modal_shown', { count, period });
    }
  }, [visible, count, period]);

  const handleUpgrade = () => {
    trackEvent('quota_upgrade_tap', { count, period });
    onUpgrade();
    onDismiss();
  };

  const handleContinueFree = () => {
    trackEvent('quota_continue_free', { count, period });
    onContinueFree();
    onDismiss();
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
            <Text style={styles.headline}>You're doing great!</Text>
            <Text style={styles.copy}>
              You've saved {count} listing{count !== 1 ? 's' : ''} this {period}. Keep going
              with SnapSell Pro - unlimited saves.
            </Text>

            <View style={styles.buttons}>
              <Pressable
                onPress={handleUpgrade}
                style={({ pressed }) => [
                  styles.primaryButton,
                  pressed && styles.primaryButtonPressed,
                ]}>
                <Text style={styles.primaryButtonText}>Upgrade</Text>
              </Pressable>

              <Pressable
                onPress={handleContinueFree}
                style={({ pressed }) => [
                  styles.secondaryButton,
                  pressed && styles.secondaryButtonPressed,
                ]}>
                <Text style={styles.secondaryButtonText}>Continue Free</Text>
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
