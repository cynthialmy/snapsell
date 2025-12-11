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
import { checkQuota } from '@/utils/listings-api';
import { initiateCreditPurchase, initiateProSubscription } from '@/utils/payments';

interface Quota {
  used: number;
  limit: number;
  remaining: number;
}

export default function UpgradeScreen() {
  const router = useRouter();
  const { user, refreshUser } = useAuth();
  const [quota, setQuota] = useState<Quota | null>(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);

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

  // Reload quota when screen comes into focus
  useFocusEffect(
    useCallback(() => {
      loadQuota();
    }, [loadQuota])
  );

  const handlePurchaseCredits = async (credits: 10 | 25 | 60) => {
    if (!user) {
      Alert.alert(
        'Account required',
        'You need to create an account to purchase credits or upgrade. Sign in to continue.',
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
      const checkoutUrl = await initiateCreditPurchase(credits);

      // Open Stripe checkout in browser
      const canOpen = await Linking.canOpenURL(checkoutUrl);
      if (canOpen) {
        await Linking.openURL(checkoutUrl);
        Alert.alert(
          'Payment Started',
          'Complete your payment in the browser. Your credits will be added automatically.',
          [
            {
              text: 'OK',
              onPress: () => {
                // Refresh user data after a delay to allow webhook to process
                setTimeout(() => refreshUser(), 5000);
              },
            },
          ]
        );
      } else {
        Alert.alert('Error', 'Cannot open payment URL');
      }
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to start payment. Please try again.');
    } finally {
      setProcessing(false);
    }
  };

  const handleSubscribe = async (plan: 'monthly' | 'yearly') => {
    if (!user) {
      Alert.alert(
        'Account required',
        'You need to create an account to purchase credits or upgrade. Sign in to continue.',
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
      const checkoutUrl = await initiateProSubscription(plan);

      const canOpen = await Linking.canOpenURL(checkoutUrl);
      if (canOpen) {
        await Linking.openURL(checkoutUrl);
        Alert.alert(
          'Subscription Started',
          'Complete your subscription in the browser. Your plan will be upgraded automatically.',
          [
            {
              text: 'OK',
              onPress: () => {
                // Refresh user data after a delay to allow webhook to process
                setTimeout(() => refreshUser(), 5000);
              },
            },
          ]
        );
      } else {
        Alert.alert('Error', 'Cannot open payment URL');
      }
    } catch (error: any) {
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
        <Text style={styles.title}>Upgrade & Credits</Text>

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
              <Text style={styles.productName}>25 Credits</Text>
              <Text style={styles.productDescription}>Create 25 additional listings</Text>
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
              <Text style={styles.productName}>60 Credits</Text>
              <Text style={styles.productDescription}>Create 60 additional listings</Text>
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
            Get unlimited listings with a subscription
          </Text>

          <View style={styles.productCard}>
            <View style={styles.productInfo}>
              <Text style={styles.productName}>Pro Monthly</Text>
              <Text style={styles.productDescription}>Unlimited listings per month</Text>
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
              <Text style={styles.productDescription}>Unlimited listings per year</Text>
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
});
