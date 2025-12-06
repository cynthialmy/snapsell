/**
 * SnapSell - Ko-fi Payment Integration
 *
 * This file provides functions for Ko-fi payment integration.
 */

import * as Linking from 'expo-linking';
import { getUser } from './auth';

const KO_FI_USERNAME = process.env.EXPO_PUBLIC_KO_FI_USERNAME || '';

/**
 * Generate Ko-fi checkout URL
 * @param productId - The product ID or subscription tier
 * @param amount - Optional amount for one-time payments
 * @param isSubscription - Whether this is a subscription or one-time payment
 */
export async function generateKoFiCheckoutUrl(
  productId: string,
  amount?: number,
  isSubscription: boolean = false
): Promise<string> {
  const { user } = await getUser();
  const clientReferenceId = user?.id || 'anonymous';

  const baseUrl = isSubscription
    ? `https://ko-fi.com/s/${KO_FI_USERNAME}`
    : `https://ko-fi.com/s/${KO_FI_USERNAME}`;

  const params = new URLSearchParams({
    client_reference_id: clientReferenceId,
    product_id: productId,
  });

  if (amount && !isSubscription) {
    params.append('amount', amount.toString());
  }

  return `${baseUrl}?${params.toString()}`;
}

/**
 * Open Ko-fi checkout in browser
 */
export async function openKoFiCheckout(
  productId: string,
  amount?: number,
  isSubscription: boolean = false
): Promise<void> {
  const url = await generateKoFiCheckoutUrl(productId, amount, isSubscription);
  const canOpen = await Linking.canOpenURL(url);

  if (canOpen) {
    await Linking.openURL(url);
  } else {
    throw new Error('Cannot open Ko-fi checkout URL');
  }
}

/**
 * Handle payment callback from deep link
 * Format: snapsell://payment/callback?status=success&reference_id=xxx
 */
export function parsePaymentCallback(url: string): {
  status: 'success' | 'failed' | 'cancelled';
  referenceId?: string;
  error?: string;
} {
  try {
    const parsed = Linking.parse(url);
    const params = parsed.queryParams || {};

    return {
      status: (params.status as 'success' | 'failed' | 'cancelled') || 'failed',
      referenceId: params.reference_id as string | undefined,
      error: params.error as string | undefined,
    };
  } catch (error) {
    console.error('Error parsing payment callback:', error);
    return { status: 'failed', error: 'Invalid callback URL' };
  }
}

/**
 * Verify payment with backend
 * This should call your backend API to verify the payment was successful
 */
export async function verifyPayment(referenceId: string): Promise<{
  verified: boolean;
  error?: string;
}> {
  try {
    // TODO: Implement backend verification endpoint
    // For now, return success if referenceId exists
    if (!referenceId) {
      return { verified: false, error: 'No reference ID provided' };
    }

    // In a real implementation, you would call your backend:
    // const response = await fetch(`${API_URL}/verify-payment`, {
    //   method: 'POST',
    //   body: JSON.stringify({ reference_id: referenceId }),
    // });

    return { verified: true };
  } catch (error: any) {
    console.error('Payment verification error:', error);
    return { verified: false, error: error.message };
  }
}
