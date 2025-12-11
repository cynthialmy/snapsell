/**
 * SnapSell - Stripe Payment Integration (via Supabase Edge Functions)
 *
 * This file provides functions for Stripe Checkout payment integration.
 * Payments are processed through Stripe Checkout, which can be configured to work with Ko-fi.
 */

import { supabase } from './auth';

// Get Edge Function base URL
const EDGE_FUNCTION_BASE = process.env.EXPO_PUBLIC_SUPABASE_FUNCTIONS_URL ||
  (process.env.EXPO_PUBLIC_SUPABASE_URL
    ? `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1`
    : null);

if (!EDGE_FUNCTION_BASE) {
  console.warn(
    'Missing Supabase configuration. Please set EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_FUNCTIONS_URL in your environment variables.'
  );
}

interface CheckoutSessionResponse {
  checkout_url: string;
  session_id: string;
}

interface PaymentVerificationResponse {
  payment: {
    id: string;
    status: string;
    type: string;
    credits: number;
    amount: number;
    currency: string;
    created_at: string;
  };
  user: {
    credits: number;
    plan: string;
  };
}

/**
 * Create checkout session for credit purchase
 * @param credits - Number of credits to purchase (10, 25, or 60)
 * @returns Checkout URL to redirect user to Stripe Checkout
 */
export async function initiateCreditPurchase(
  credits: 10 | 25 | 60
): Promise<string> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      throw new Error('Not authenticated');
    }

    if (!EDGE_FUNCTION_BASE) {
      throw new Error('Supabase Edge Functions URL not configured');
    }

    const response = await fetch(`${EDGE_FUNCTION_BASE}/create-checkout-session`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        type: 'credits',
        credits: credits,
        user_id: session.user.id,
      }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Failed to create checkout session' }));
      throw new Error(error.error || 'Failed to create checkout session');
    }

    const data: CheckoutSessionResponse = await response.json();
    return data.checkout_url;
  } catch (error: any) {
    console.error('Credit purchase error:', error);
    throw error;
  }
}

/**
 * Create checkout session for Pro subscription
 * @param plan - Subscription plan type ('monthly' or 'yearly')
 * @returns Checkout URL to redirect user to Stripe Checkout
 */
export async function initiateProSubscription(
  plan: 'monthly' | 'yearly'
): Promise<string> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      throw new Error('Not authenticated');
    }

    if (!EDGE_FUNCTION_BASE) {
      throw new Error('Supabase Edge Functions URL not configured');
    }

    const response = await fetch(`${EDGE_FUNCTION_BASE}/create-checkout-session`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        type: 'subscription',
        subscription_plan: plan,
        user_id: session.user.id,
      }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Failed to create checkout session' }));
      throw new Error(error.error || 'Failed to create checkout session');
    }

    const data: CheckoutSessionResponse = await response.json();
    return data.checkout_url;
  } catch (error: any) {
    console.error('Subscription error:', error);
    throw error;
  }
}

/**
 * Verify payment status by session ID
 * @param sessionId - Stripe Checkout session ID
 * @returns Payment verification response with payment details and updated user info
 */
export async function verifyPaymentStatus(
  sessionId: string
): Promise<PaymentVerificationResponse> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      throw new Error('Not authenticated');
    }

    if (!EDGE_FUNCTION_BASE) {
      throw new Error('Supabase Edge Functions URL not configured');
    }

    const response = await fetch(
      `${EDGE_FUNCTION_BASE}/verify-payment?reference_id=${sessionId}`,
      {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
        },
      }
    );

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Failed to verify payment' }));
      throw new Error(error.error || 'Failed to verify payment');
    }

    return await response.json();
  } catch (error: any) {
    console.error('Payment verification error:', error);
    throw error;
  }
}

/**
 * Handle payment callback from deep link
 * Format: snapsell://payment/success?session_id=xxx
 * or: snapsell://payment/callback?status=success&session_id=xxx
 */
export function parsePaymentCallback(url: string): {
  status: 'success' | 'failed' | 'cancelled';
  sessionId?: string;
  error?: string;
} {
  try {
    const urlObj = new URL(url);
    const params = urlObj.searchParams;

    // Check for session_id (Stripe format)
    const sessionId = params.get('session_id') || undefined;

    // Check for status (legacy format)
    const status = (params.get('status') as 'success' | 'failed' | 'cancelled') ||
      (sessionId ? 'success' : 'failed');

    return {
      status,
      sessionId,
      error: params.get('error') || undefined,
    };
  } catch (error) {
    console.error('Error parsing payment callback:', error);
    return { status: 'failed', error: 'Invalid callback URL' };
  }
}

/**
 * Verify payment with backend (legacy function for compatibility)
 * @deprecated Use verifyPaymentStatus instead
 */
export async function verifyPayment(sessionId: string): Promise<{
  verified: boolean;
  error?: string;
}> {
  try {
    const result = await verifyPaymentStatus(sessionId);
    return { verified: result.payment.status === 'completed' || result.payment.status === 'succeeded' };
  } catch (error: any) {
    console.error('Payment verification error:', error);
    return { verified: false, error: error.message };
  }
}
