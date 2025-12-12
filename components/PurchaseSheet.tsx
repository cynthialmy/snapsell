import * as Linking from 'expo-linking';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
    Alert,
    Modal,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    useWindowDimensions,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/contexts/AuthContext';
import { trackEvent } from '@/utils/analytics';
import { initiatePackPurchase, initiateProSubscription } from '@/utils/payments';

interface PurchaseSheetProps {
  visible: boolean;
  onDismiss: () => void;
}

export function PurchaseSheet({ visible, onDismiss }: PurchaseSheetProps) {
  const router = useRouter();
  const { user } = useAuth();
  const [processing, setProcessing] = useState(false);
  const { height: screenHeight } = useWindowDimensions();
  // Use 95% of screen height to allow sheet to come up more
  const maxModalHeight = screenHeight * 0.95;

  // Track when sheet is shown
  React.useEffect(() => {
    if (visible) {
      trackEvent('purchase_sheet_opened');
    }
  }, [visible]);

  // Reset processing state when modal closes
  React.useEffect(() => {
    if (!visible) {
      setProcessing(false);
    }
  }, [visible]);

  const handleDismiss = () => {
    onDismiss();
  };

  const handlePurchasePack = async (sku: 'credits_10' | 'credits_25' | 'credits_60') => {
    if (!user) {
      Alert.alert(
        'Account required',
        'You need to create an account to purchase packs or upgrade. Sign in to continue.',
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
      // Track purchase initiation
      trackEvent('tap_buy_pack', { sku });

      // Use deep links directly for Stripe redirects
      const deepLinkScheme = process.env.EXPO_PUBLIC_DEEP_LINK_SCHEME || 'snapsell';
      const successUrl = `${deepLinkScheme}://payment/success?session_id={CHECKOUT_SESSION_ID}`;
      const cancelUrl = `${deepLinkScheme}://payment/cancel`;

      const { checkout_url } = await initiatePackPurchase(sku, {
        successUrl,
        cancelUrl,
      });

      // Open Stripe checkout in browser
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
        onDismiss();
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
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={handleDismiss}
      statusBarTranslucent>
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={handleDismiss} />
        <SafeAreaView style={styles.safeAreaContainer} edges={['bottom']}>
          <View style={[styles.modal, { maxHeight: maxModalHeight }]}>
            {/* Header */}
            <View style={styles.header}>
              <Text style={styles.headerTitle}>Purchase Options</Text>
              <Pressable onPress={handleDismiss} style={styles.closeButton}>
                <Text style={styles.closeButtonText}>✕</Text>
              </Pressable>
            </View>

            <View style={styles.scrollContainer}>
              <ScrollView
                style={styles.scrollView}
                contentContainerStyle={styles.content}
                showsVerticalScrollIndicator={true}
                bounces={true}
                nestedScrollEnabled={true}>
              {/* Pack Options */}
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Pack Options</Text>
                <Text style={styles.sectionDescription}>
                  Purchase packs to add both creations and Save Slots
                </Text>

                <View style={styles.productCard}>
                  <View style={styles.productInfo}>
                    <Text style={styles.productName}>10-Pack</Text>
                    <Text style={styles.productDescription}>
                      Adds +10 creations & +10 saves
                    </Text>
                    <Text style={styles.productPrice}>$2.99</Text>
                  </View>
                  <Pressable
                    onPress={() => handlePurchasePack('credits_10')}
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

                <View style={[styles.productCard, styles.popularCard]}>
                  <View style={styles.popularBadge}>
                    <Text style={styles.popularBadgeText}>Most popular</Text>
                  </View>
                  <View style={styles.productInfo}>
                    <Text style={styles.productName}>25-Pack</Text>
                    <Text style={styles.productDescription}>
                      Adds +25 creations & +25 saves
                    </Text>
                    <Text style={styles.productPrice}>$5.99</Text>
                  </View>
                  <Pressable
                    onPress={() => handlePurchasePack('credits_25')}
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
                    <Text style={styles.productName}>60-Pack</Text>
                    <Text style={styles.productDescription}>
                      Adds +60 creations & +60 saves
                    </Text>
                    <Text style={styles.productPrice}>$12.99</Text>
                    <Text style={styles.productNote}>Best value</Text>
                  </View>
                  <Pressable
                    onPress={() => handlePurchasePack('credits_60')}
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
                  Get unlimited creations and Save Slots with a subscription
                </Text>

                <View style={styles.productCard}>
                  <View style={styles.productInfo}>
                    <Text style={styles.productName}>Pro Monthly</Text>
                    <Text style={styles.productDescription}>
                      Unlimited creations and Save Slots forever. No limits.
                    </Text>
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
                      Unlimited creations and Save Slots forever. Best value for frequent sellers.
                    </Text>
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
  safeAreaContainer: {
    width: '100%',
    justifyContent: 'flex-end',
    alignSelf: 'flex-end',
  },
  modal: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 10,
    overflow: 'hidden',
    width: '100%',
    minHeight: 500,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#0F172A',
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButtonText: {
    fontSize: 18,
    color: '#64748B',
    fontWeight: '600',
  },
  scrollContainer: {
    flex: 1,
    minHeight: 0,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: 20,
    paddingBottom: 40,
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
    position: 'relative',
  },
  popularCard: {
    borderColor: '#4338CA',
    borderWidth: 2,
    backgroundColor: '#F8FAFC',
  },
  popularBadge: {
    position: 'absolute',
    top: -10,
    right: 16,
    backgroundColor: '#4338CA',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  popularBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  productPrice: {
    fontSize: 20,
    fontWeight: '700',
    color: '#0F172A',
    marginTop: 8,
    marginBottom: 4,
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
