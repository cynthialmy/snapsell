import * as Linking from 'expo-linking';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/contexts/AuthContext';
import { trackEvent, trackScreenView } from '@/utils/analytics';
import { checkQuota } from '@/utils/listings-api';
import { getPaymentHistory, initiateCreditPurchase, initiateProSubscription, type PaymentHistoryItem } from '@/utils/payments';

interface Quota {
  used: number;
  limit: number;
  remaining: number;
}

export default function UpgradeScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [quota, setQuota] = useState<Quota | null>(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [paymentHistory, setPaymentHistory] = useState<PaymentHistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const loadQuota = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }

    try {
      const { quota: userQuota, error } = await checkQuota();
      if (error) {
        console.error('Error loading quota:', error);
      } else {
        setQuota(userQuota);
      }
    } catch (error) {
      console.error('Error loading quota:', error);
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

  const handlePurchaseCredits = async (credits: 10 | 25 | 60) => {
    if (!user) {
      Alert.alert(
        'Account required',
        'You need to create an account to purchase Save Slots or upgrade. Sign in to continue.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Sign In',
            onPress: () => router.push('/(auth)/sign-in'),
          },
        ]
      );
      return;
    }

    setProcessing(true);
    try {
      // Track purchase initiation
      trackEvent('purchase_initiated', {
        product_type: 'credits',
        product_id: credits.toString(),
        amount: credits, // This would be the actual price in production
      });

      // Use deep links directly for Stripe redirects
      // Note: Browser redirects can't include auth headers, so we use deep links
      // The webhook processes payment automatically; deep link is for UX
      const deepLinkScheme = process.env.EXPO_PUBLIC_DEEP_LINK_SCHEME || 'snapsell';
      const successUrl = `${deepLinkScheme}://payment/success?session_id={CHECKOUT_SESSION_ID}`;
      const cancelUrl = `${deepLinkScheme}://payment/cancel`;

      const checkoutUrl = await initiateCreditPurchase(credits, {
        successUrl,
        cancelUrl,
      });

      // Open Stripe checkout in browser
      const canOpen = await Linking.canOpenURL(checkoutUrl);
      if (canOpen) {
        await Linking.openURL(checkoutUrl);
        Alert.alert(
          'Payment Started',
          'Complete your payment in the browser. You will be redirected back to the app when payment is complete.',
          [{ text: 'OK' }]
        );
      } else {
        Alert.alert('Error', 'Cannot open payment URL');
      }
    } catch (error: any) {
      trackEvent('purchase_failed', {
        product_type: 'credits',
        product_id: credits.toString(),
        error: error.message || 'Unknown error',
      });
      Alert.alert('Error', error.message || 'Failed to start payment. Please try again.');
    } finally {
      setProcessing(false);
    }
  };

  const handleSubscribe = async (plan: 'monthly' | 'yearly') => {
    if (!user) {
      Alert.alert(
        'Account required',
        'You need to create an account to purchase Save Slots or upgrade. Sign in to continue.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Sign In',
            onPress: () => router.push('/(auth)/sign-in'),
          },
        ]
      );
      return;
    }

    setProcessing(true);
    try {
      // Track subscription initiation
      trackEvent('purchase_initiated', {
        product_type: 'subscription',
        product_id: plan,
        amount: plan === 'monthly' ? 'monthly' : 'yearly', // This would be the actual price in production
      });

      // Use deep links directly for Stripe redirects
      // Note: Browser redirects can't include auth headers, so we use deep links
      // The webhook processes payment automatically; deep link is for UX
      const deepLinkScheme = process.env.EXPO_PUBLIC_DEEP_LINK_SCHEME || 'snapsell';
      const successUrl = `${deepLinkScheme}://payment/success?session_id={CHECKOUT_SESSION_ID}`;
      const cancelUrl = `${deepLinkScheme}://payment/cancel`;

      const checkoutUrl = await initiateProSubscription(plan, {
        successUrl,
        cancelUrl,
      });

      const canOpen = await Linking.canOpenURL(checkoutUrl);
      if (canOpen) {
        await Linking.openURL(checkoutUrl);
        Alert.alert(
          'Subscription Started',
          'Complete your subscription in the browser. You will be redirected back to the app when payment is complete.',
          [{ text: 'OK' }]
        );
      } else {
        Alert.alert('Error', 'Cannot open payment URL');
      }
    } catch (error: any) {
      trackEvent('purchase_failed', {
        product_type: 'subscription',
        product_id: plan,
        error: error.message || 'Unknown error',
      });
      Alert.alert('Error', error.message || 'Failed to start subscription. Please try again.');
    } finally {
      setProcessing(false);
    }
  };

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

        {/* Save Slots Balance Card */}
        {user && (
          <View style={styles.creditsCard}>
            <Text style={styles.creditsTitle}>Your Save Slots</Text>
            <Text style={styles.creditsAmount}>
              {((user as any).credits ?? 0)} Save Slots
            </Text>
            <Text style={styles.creditsExplanation}>
              1 Save Slot = 1 saved listing. Save Slots never expire and can be used anytime.
            </Text>
            {/* Debug: Show user data */}
            {__DEV__ && (
              <Text style={{ fontSize: 10, color: '#999', marginTop: 8 }}>
                Debug: credits={((user as any).credits ?? 'undefined')},
                user_id={user.id?.substring(0, 8)}...
              </Text>
            )}
          </View>
        )}

        {/* What are Save Slots Explanation */}
        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>What are Save Slots?</Text>
          <Text style={styles.infoText}>
            Creating listings is always free. Save Slots let you save listings to your account for later. Each Save Slot equals one saved listing.
          </Text>
          <Text style={styles.infoText}>
            • Save Slots never expire{'\n'}
            • Use them anytime to save listings{'\n'}
            • Purchase Save Slot packs or subscribe for unlimited saves
          </Text>
        </View>

        {quota && (
          <View style={styles.quotaCard}>
            <Text style={styles.quotaTitle}>Current Usage</Text>
            <Text style={styles.quotaText}>
              {quota.used} / {quota.limit} listings used
            </Text>
            <Text style={styles.quotaSubtext}>
              {quota.remaining} remaining
            </Text>
          </View>
        )}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Credit Packs</Text>
          <Text style={styles.sectionDescription}>
            Purchase additional credits to create more listings
          </Text>

          <View style={styles.productCard}>
            <View style={styles.productInfo}>
              <Text style={styles.productName}>10 Credits</Text>
              <Text style={styles.productDescription}>Create 10 additional listings</Text>
            </View>
            <Pressable
              onPress={() => handlePurchaseCredits(10)}
              disabled={processing}
              style={({ pressed }) => [
                styles.purchaseButton,
                (processing || pressed) && styles.purchaseButtonDisabled,
              ]}>
              <Text style={styles.purchaseButtonText}>
                {processing ? 'Processing...' : 'Purchase'}
              </Text>
            </Pressable>
          </View>

          <View style={styles.productCard}>
            <View style={styles.productInfo}>
              <Text style={styles.productName}>25 Save Slots</Text>
              <Text style={styles.productDescription}>Save 25 listings to your account. Save Slots never expire and can be used anytime.</Text>
              <Text style={styles.productNote}>Creating listings is always free. Save Slots are only used when you save a listing.</Text>
            </View>
            <Pressable
              onPress={() => handlePurchaseCredits(25)}
              disabled={processing}
              style={({ pressed }) => [
                styles.purchaseButton,
                (processing || pressed) && styles.purchaseButtonDisabled,
              ]}>
              <Text style={styles.purchaseButtonText}>
                {processing ? 'Processing...' : 'Purchase'}
              </Text>
            </Pressable>
          </View>

          <View style={styles.productCard}>
            <View style={styles.productInfo}>
              <Text style={styles.productName}>60 Save Slots</Text>
              <Text style={styles.productDescription}>Save 60 listings to your account. Save Slots never expire and can be used anytime.</Text>
              <Text style={styles.productNote}>Creating listings is always free. Save Slots are only used when you save a listing.</Text>
            </View>
            <Pressable
              onPress={() => handlePurchaseCredits(60)}
              disabled={processing}
              style={({ pressed }) => [
                styles.purchaseButton,
                (processing || pressed) && styles.purchaseButtonDisabled,
              ]}>
              <Text style={styles.purchaseButtonText}>
                {processing ? 'Processing...' : 'Purchase'}
              </Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Subscription Plans</Text>
          <Text style={styles.sectionDescription}>
            Get unlimited Save Slots with a subscription
          </Text>

          <View style={styles.productCard}>
            <View style={styles.productInfo}>
              <Text style={styles.productName}>Pro Monthly</Text>
              <Text style={styles.productDescription}>Unlimited Save Slots forever. Save as many listings as you want, no limits.</Text>
              <Text style={styles.productNote}>Cancel anytime. Your saved listings remain accessible.</Text>
            </View>
            <Pressable
              onPress={() => handleSubscribe('monthly')}
              disabled={processing}
              style={({ pressed }) => [
                styles.purchaseButton,
                (processing || pressed) && styles.purchaseButtonDisabled,
              ]}>
              <Text style={styles.purchaseButtonText}>
                {processing ? 'Processing...' : 'Subscribe'}
              </Text>
            </Pressable>
          </View>

          <View style={styles.productCard}>
            <View style={styles.productInfo}>
              <Text style={styles.productName}>Pro Yearly</Text>
              <Text style={styles.productDescription}>Unlimited Save Slots forever. Best value for frequent sellers.</Text>
              <Text style={styles.productNote}>Cancel anytime. Your saved listings remain accessible.</Text>
            </View>
            <Pressable
              onPress={() => handleSubscribe('yearly')}
              disabled={processing}
              style={({ pressed }) => [
                styles.purchaseButton,
                (processing || pressed) && styles.purchaseButtonDisabled,
              ]}>
              <Text style={styles.purchaseButtonText}>
                {processing ? 'Processing...' : 'Subscribe'}
              </Text>
            </Pressable>
          </View>
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
  creditsCard: {
    backgroundColor: '#F0FDF4',
    borderRadius: 14,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#BBF7D0',
  },
  creditsTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#166534',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  creditsAmount: {
    fontSize: 32,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 8,
  },
  creditsExplanation: {
    fontSize: 13,
    color: '#64748B',
    lineHeight: 18,
  },
  infoCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    padding: 20,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 12,
  },
  infoText: {
    fontSize: 14,
    color: '#64748B',
    lineHeight: 20,
    marginBottom: 8,
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
  productCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 20,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  productInfo: {
    flex: 1,
  },
  productName: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 4,
  },
  productDescription: {
    fontSize: 14,
    color: '#64748B',
    marginBottom: 4,
  },
  productNote: {
    fontSize: 12,
    color: '#94A3B8',
    fontStyle: 'italic',
    marginTop: 4,
  },
  purchaseButton: {
    backgroundColor: '#4338CA',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
  },
  purchaseButtonDisabled: {
    opacity: 0.5,
  },
  purchaseButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
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
