import * as Linking from 'expo-linking';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import {
    Alert,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/contexts/AuthContext';
import { trackEvent, trackScreenView } from '@/utils/analytics';
import { initiateCreditPurchase, initiateProSubscription } from '@/utils/payments';

export default function PurchaseScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [processing, setProcessing] = useState(false);

  useFocusEffect(
    useCallback(() => {
      trackScreenView('purchase');
    }, [])
  );

  const handlePurchaseSlots = async (slots: 10 | 25 | 60) => {
    if (!user) {
      Alert.alert(
        'Account required',
        'You need to create an account to purchase Save Slots or upgrade. Sign in to continue.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Sign In',
            onPress: () => {
              router.push('/(auth)/sign-in');
            },
          },
        ]
      );
      return;
    }

    setProcessing(true);
    try {
      // Track purchase initiation
      trackEvent('purchase_initiated', {
        product_type: 'save_slots',
        product_id: slots.toString(),
        amount: slots,
      });

      // Use deep links directly for Stripe redirects
      const deepLinkScheme = process.env.EXPO_PUBLIC_DEEP_LINK_SCHEME || 'snapsell';
      const successUrl = `${deepLinkScheme}://payment/success?session_id={CHECKOUT_SESSION_ID}`;
      const cancelUrl = `${deepLinkScheme}://payment/cancel`;

      const checkoutUrl = await initiateCreditPurchase(slots, {
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
        product_type: 'save_slots',
        product_id: slots.toString(),
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
            onPress: () => {
              router.push('/(auth)/sign-in');
            },
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
        amount: plan === 'monthly' ? 'monthly' : 'yearly',
      });

      // Use deep links directly for Stripe redirects
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

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
        <Text style={styles.title}>Purchase Options</Text>

        {/* Save Slot Packs */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Save Slot Packs</Text>
          <Text style={styles.sectionDescription}>
            Free tier includes 10 creations per day and 10 free Save Slots. Purchase additional Save Slots to save more listings.
          </Text>

          <View style={styles.productCard}>
            <View style={styles.productInfo}>
              <Text style={styles.productName}>10 Save Slots</Text>
              <Text style={styles.productDescription}>
                Save 10 listings to your account. Save Slots never expire and can be used anytime.
              </Text>
              <Text style={styles.productPrice}>$5.00</Text>
              <Text style={styles.productNote}>
                Creating listings is always free (10 per day on free tier). Save Slots are only used when you save a listing.
              </Text>
            </View>
            <Pressable
              onPress={() => handlePurchaseSlots(10)}
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
              <Text style={styles.productDescription}>
                Save 25 listings to your account. Save Slots never expire and can be used anytime.
              </Text>
              <Text style={styles.productPrice}>$10.00</Text>
              <Text style={styles.productNote}>
                Creating listings is always free (10 per day on free tier). Save Slots are only used when you save a listing.
              </Text>
            </View>
            <Pressable
              onPress={() => handlePurchaseSlots(25)}
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
              <Text style={styles.productDescription}>
                Save 60 listings to your account. Save Slots never expire and can be used anytime.
              </Text>
              <Text style={styles.productPrice}>$20.00</Text>
              <Text style={styles.productNote}>
                Creating listings is always free (10 per day on free tier). Save Slots are only used when you save a listing.
              </Text>
            </View>
            <Pressable
              onPress={() => handlePurchaseSlots(60)}
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

        {/* Subscription Plans */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Subscription Plans</Text>
          <Text style={styles.sectionDescription}>
            Free tier includes 10 creations per day and 10 free Save Slots. Get unlimited creations and Save Slots with a subscription.
          </Text>

          <View style={styles.productCard}>
            <View style={styles.productInfo}>
              <Text style={styles.productName}>Pro Monthly</Text>
              <Text style={styles.productDescription}>
                Unlimited creations per day and unlimited Save Slots forever. No limits on creating or saving listings.
              </Text>
              <Text style={styles.productPrice}>$4.99/month</Text>
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
              <Text style={styles.productDescription}>
                Unlimited creations per day and unlimited Save Slots forever. Best value for frequent sellers.
              </Text>
              <Text style={styles.productPrice}>$35.99/year</Text>
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
    backgroundColor: '#FFFFFF',
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: 24,
    paddingBottom: 48,
  },
  title: {
    fontSize: 32,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 32,
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
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    padding: 20,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  productInfo: {
    marginBottom: 16,
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
    lineHeight: 20,
  },
  productPrice: {
    fontSize: 20,
    fontWeight: '700',
    color: '#0F172A',
    marginTop: 8,
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
    alignItems: 'center',
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
