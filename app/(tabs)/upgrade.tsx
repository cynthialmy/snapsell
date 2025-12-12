import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/contexts/AuthContext';
import { trackEvent, trackScreenView } from '@/utils/analytics';
import { checkQuota, type UserQuota } from '@/utils/listings-api';
import { getPaymentHistory, type PaymentHistoryItem } from '@/utils/payments';

export default function UpgradeScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [quota, setQuota] = useState<UserQuota | null>(null);
  const [loading, setLoading] = useState(true);
  const [paymentHistory, setPaymentHistory] = useState<PaymentHistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [showSaveSlotsInfo, setShowSaveSlotsInfo] = useState(false);

  const loadQuota = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }

    try {
      const { quota: userQuota, error } = await checkQuota();
      if (error) {
        console.error('Error loading quota:', error);
        // If it's a 500 error, it's a backend issue - don't show quota but don't block the UI
        if (error.status === 500) {
          console.warn('Backend quota endpoint is returning 500 error. This is a backend SQL issue that needs to be fixed.');
        }
        // Set quota to null so UI doesn't show incorrect data
        setQuota(null);
      } else {
        setQuota(userQuota);
      }
    } catch (error) {
      console.error('Error loading quota:', error);
      setQuota(null);
    } finally {
      setLoading(false);
    }
  }, [user]);

  const loadPaymentHistory = useCallback(async () => {
    if (!user) {
      return;
    }

    setHistoryLoading(true);
    try {
      const { payments, error } = await getPaymentHistory(10);
      if (error) {
        console.error('Error loading payment history:', error);
      } else {
        setPaymentHistory(payments);
        trackEvent('payment_history_viewed', { payment_count: payments?.length || 0 });
      }
    } catch (error) {
      console.error('Error loading payment history:', error);
    } finally {
      setHistoryLoading(false);
    }
  }, [user]);

  // Reload quota and payment history when screen comes into focus
  useFocusEffect(
    useCallback(() => {
      trackScreenView('upgrade', { is_authenticated: !!user });
      loadQuota();
      loadPaymentHistory();
      // Note: refreshUser() is called automatically after payments in _layout.tsx
      // No need to refresh on every focus - credits only change after payments
    }, [loadQuota, loadPaymentHistory, user])
  );


  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Loading...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
        <Text style={styles.title}>Upgrade & Save Slots</Text>

        {quota && (
          <View style={styles.quotaCard}>
            <Text style={styles.quotaTitle}>Current Usage</Text>
            {quota.is_pro ? (
              <>
                <Text style={styles.quotaText}>Pro Member</Text>
                <Text style={styles.quotaSubtext}>
                  Unlimited creations and Save Slots
                </Text>
              </>
            ) : (
              <>
                <Text style={styles.quotaText}>
                  Creations: {quota.creations_remaining_today} / {quota.creations_daily_limit} left today
                </Text>
                <Text style={styles.quotaSubtext}>
                  Save Slots: {quota.save_slots_remaining} remaining
                </Text>
                {quota.bonus_creations_remaining > 0 && (
                  <Text style={styles.quotaSubtext}>
                    Bonus creations: {quota.bonus_creations_remaining} remaining
                  </Text>
                )}
              </>
            )}

            {/* Collapsible "What are Save Slots?" section */}
            <Pressable
              onPress={() => setShowSaveSlotsInfo(!showSaveSlotsInfo)}
              style={styles.infoToggle}>
              <Text style={styles.infoToggleText}>
                What are Save Slots?
              </Text>
              <Text style={styles.infoToggleIcon}>
                {showSaveSlotsInfo ? '▼' : '▶'}
              </Text>
            </Pressable>

            {showSaveSlotsInfo && (
              <View style={styles.infoContent}>
                <Text style={styles.infoText}>
                  Creating listings is always free. Save Slots let you save listings to your account for later. Each Save Slot equals one saved listing.
                </Text>
                <Text style={styles.infoText}>
                  • Save Slots never expire{'\n'}
                  • Use them anytime to save listings{'\n'}
                  • Purchase Save Slot packs or subscribe for unlimited saves
                </Text>
              </View>
            )}
          </View>
        )}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Purchase Options</Text>
          <Text style={styles.sectionDescription}>
            Choose from Save Slot packs or subscription plans
          </Text>

          <Pressable
            onPress={() => {
              trackEvent('purchase_options_opened', { source: 'upgrade_screen' });
              router.push('/purchase');
            }}
            style={({ pressed }) => [
              styles.purchaseOptionsButton,
              pressed && styles.purchaseOptionsButtonPressed,
            ]}>
            <Text style={styles.purchaseOptionsButtonText}>View All Purchase Options</Text>
            <Text style={styles.purchaseOptionsArrow}>→</Text>
          </Pressable>
        </View>

        {/* Purchase History */}
        {user && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Purchase History</Text>
            {historyLoading ? (
              <Text style={styles.historyEmptyText}>Loading...</Text>
            ) : paymentHistory.length === 0 ? (
              <Text style={styles.historyEmptyText}>No purchases yet</Text>
            ) : (
              paymentHistory.map((payment) => (
                <View key={payment.id} style={styles.historyCard}>
                  <View style={styles.historyInfo}>
                    <Text style={styles.historyType}>
                      {payment.type === 'credits'
                        ? `${payment.credits || 0} Save Slots`
                        : 'Pro Subscription'}
                    </Text>
                    <Text style={styles.historyDate}>
                      {new Date(payment.created_at).toLocaleDateString('en-US', {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                      })}
                    </Text>
                  </View>
                  <View style={styles.historyRight}>
                    <Text style={styles.historyAmount}>
                      {payment.currency === 'usd' ? '$' : payment.currency.toUpperCase()}
                      {(payment.amount / 100).toFixed(2)}
                    </Text>
                    <Text style={[
                      styles.historyStatus,
                      payment.status === 'completed' || payment.status === 'succeeded'
                        ? styles.historyStatusSuccess
                        : styles.historyStatusPending
                    ]}>
                      {payment.status === 'completed' || payment.status === 'succeeded'
                        ? 'Completed'
                        : payment.status}
                    </Text>
                  </View>
                </View>
              ))
            )}
          </View>
        )}

        <View style={styles.noteSection}>
          <Text style={styles.noteText}>
            Payments are processed securely through Stripe Checkout. Your account will be updated automatically after payment confirmation.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F6F8FB',
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: 24,
    paddingBottom: 48,
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
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 24,
  },
  quotaCard: {
    backgroundColor: '#EFF6FF',
    borderRadius: 14,
    padding: 20,
    marginBottom: 32,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  quotaTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0369A1',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  quotaText: {
    fontSize: 24,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 4,
  },
  quotaSubtext: {
    fontSize: 14,
    color: '#64748B',
    marginBottom: 12,
  },
  infoToggle: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#BFDBFE',
  },
  infoToggleText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0369A1',
  },
  infoToggleIcon: {
    fontSize: 12,
    color: '#0369A1',
  },
  infoContent: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#BFDBFE',
  },
  infoText: {
    fontSize: 14,
    color: '#64748B',
    lineHeight: 20,
    marginBottom: 8,
  },
  section: {
    marginBottom: 32,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 8,
  },
  sectionDescription: {
    fontSize: 14,
    color: '#64748B',
    marginBottom: 16,
  },
  purchaseOptionsButton: {
    backgroundColor: '#4338CA',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  purchaseOptionsButtonPressed: {
    backgroundColor: '#3730A3',
    opacity: 0.9,
  },
  purchaseOptionsButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  purchaseOptionsArrow: {
    fontSize: 18,
    color: '#FFFFFF',
    fontWeight: '600',
    marginLeft: 8,
  },
  noteSection: {
    marginTop: 16,
    padding: 16,
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  noteText: {
    fontSize: 12,
    color: '#64748B',
    lineHeight: 18,
    textAlign: 'center',
  },
  historyCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  historyInfo: {
    flex: 1,
  },
  historyType: {
    fontSize: 16,
    fontWeight: '600',
    color: '#0F172A',
    marginBottom: 4,
  },
  historyDate: {
    fontSize: 13,
    color: '#64748B',
  },
  historyRight: {
    alignItems: 'flex-end',
  },
  historyAmount: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 4,
  },
  historyStatus: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  historyStatusSuccess: {
    color: '#166534',
  },
  historyStatusPending: {
    color: '#D97706',
  },
  historyEmptyText: {
    fontSize: 14,
    color: '#64748B',
    textAlign: 'center',
    padding: 20,
    fontStyle: 'italic',
  },
});
