/**
 * SnapSell - Stripe Payment Integration (via Supabase Edge Functions)
 *
 * This file provides functions for Stripe Checkout payment integration.
 * Payments are processed through Stripe Checkout, which can be configured to work with Ko-fi.
 *
 * ## Redirect URL Notes:
 *
 * **Custom Scheme URLs (snapsell://):**
 * - May not work reliably in all browsers when Stripe redirects
 * - Browsers may show an error or fail to open the app
 * - The webhook still processes payments automatically, so this is mainly a UX issue
 *
 * **Recommended Approaches:**
 * 1. **Universal Links (iOS) / App Links (Android)** - Best UX, works in browsers
 *    - Configure in app.json/app.config.js
 *    - Use HTTPS URLs that redirect to your app
 *    - Example: `https://yourapp.com/payment/success?session_id={CHECKOUT_SESSION_ID}`
 *
 * 2. **Web Redirect Page** - Simple fallback
 *    - Create a simple HTML page that redirects to deep link
 *    - Example: `https://yourapp.com/payment/success` → redirects to `snapsell://payment/success`
 *
 * 3. **Default Deep Links** - Works if user manually returns to app
 *    - Backend will use default deep links if URLs not provided
 *    - Payment still processes via webhook
 */

import { supabase } from './auth';

// Get Edge Function base URL
function getEdgeFunctionBase(): string | null {
  const functionsUrl = process.env.EXPO_PUBLIC_SUPABASE_FUNCTIONS_URL;
  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;

  if (functionsUrl) {
    // Remove trailing slash if present
    return functionsUrl.replace(/\/$/, '');
  }

  if (supabaseUrl) {
    // Remove trailing slash if present, then add /functions/v1
    const baseUrl = supabaseUrl.replace(/\/$/, '');
    return `${baseUrl}/functions/v1`;
  }

  return null;
}

const EDGE_FUNCTION_BASE = getEdgeFunctionBase();

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
 * Options for checkout session creation
 */
interface CheckoutOptions {
  /** Custom success URL (defaults to deep link: snapsell://payment/success) */
  successUrl?: string;
  /** Custom cancel URL (defaults to deep link: snapsell://payment/cancel) */
  cancelUrl?: string;
}

/**
 * Create checkout session for credit purchase
 * @param credits - Number of credits to purchase (10, 25, or 60)
 * @param options - Optional configuration including success_url and cancel_url
 * @returns Checkout URL to redirect user to Stripe Checkout
 *
 * @example
 * // Use default deep links
 * const url = await initiateCreditPurchase(10);
 *
 * @example
 * // Use custom URLs (recommended: Universal Links/App Links)
 * const url = await initiateCreditPurchase(10, {
 *   successUrl: 'https://yourapp.com/payment/success?session_id={CHECKOUT_SESSION_ID}',
 *   cancelUrl: 'https://yourapp.com/payment/cancel',
 * });
 *
 * @example
 * // Use deep links explicitly
 * const url = await initiateCreditPurchase(10, {
 *   successUrl: 'snapsell://payment/success?session_id={CHECKOUT_SESSION_ID}',
 *   cancelUrl: 'snapsell://payment/cancel',
 * });
 */
export async function initiateCreditPurchase(
  credits: 10 | 25 | 60,
  options?: CheckoutOptions
): Promise<string> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      throw new Error('Not authenticated');
    }

    if (!EDGE_FUNCTION_BASE) {
      throw new Error('Supabase Edge Functions URL not configured');
    }

    // Get deep link scheme for default redirect URLs
    const deepLinkScheme = process.env.EXPO_PUBLIC_DEEP_LINK_SCHEME || 'snapsell';
    const defaultSuccessUrl = `${deepLinkScheme}://payment/success?session_id={CHECKOUT_SESSION_ID}`;
    const defaultCancelUrl = `${deepLinkScheme}://payment/cancel`;

    const requestBody: any = {
      type: 'credits',
      credits: credits,
      user_id: session.user.id,
    };

    // Only include URLs if provided (backend will use defaults if not provided)
    if (options?.successUrl) {
      requestBody.success_url = options.successUrl;
    }
    if (options?.cancelUrl) {
      requestBody.cancel_url = options.cancelUrl;
    }

    const response = await fetch(`${EDGE_FUNCTION_BASE}/create-checkout-session`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      // Try to get error details from response
      let errorMessage = 'Failed to create checkout session';
      let errorDetails: any = null;

      try {
        const errorText = await response.text();
        try {
          errorDetails = JSON.parse(errorText);
          errorMessage = errorDetails.error || errorDetails.message || errorMessage;
        } catch {
          // Response is not JSON, might be HTML or plain text
          errorMessage = `Backend error (${response.status} ${response.statusText}): ${errorText.substring(0, 200)}`;
        }
      } catch (e) {
        errorMessage = `Backend error: ${response.status} ${response.statusText}`;
      }

      console.error('Checkout session creation failed:', {
        status: response.status,
        statusText: response.statusText,
        errorDetails,
        url: `${EDGE_FUNCTION_BASE}/create-checkout-session`,
      });

      throw new Error(errorMessage);
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
 * @param options - Optional configuration including success_url and cancel_url
 * @returns Checkout URL to redirect user to Stripe Checkout
 *
 * @example
 * // Use default deep links
 * const url = await initiateProSubscription('monthly');
 *
 * @example
 * // Use custom URLs (recommended: Universal Links/App Links)
 * const url = await initiateProSubscription('monthly', {
 *   successUrl: 'https://yourapp.com/payment/success?session_id={CHECKOUT_SESSION_ID}',
 *   cancelUrl: 'https://yourapp.com/payment/cancel',
 * });
 *
 * @example
 * // Use deep links explicitly
 * const url = await initiateProSubscription('monthly', {
 *   successUrl: 'snapsell://payment/success?session_id={CHECKOUT_SESSION_ID}',
 *   cancelUrl: 'snapsell://payment/cancel',
 * });
 */
export async function initiateProSubscription(
  plan: 'monthly' | 'yearly',
  options?: CheckoutOptions
): Promise<string> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      throw new Error('Not authenticated');
    }

    if (!EDGE_FUNCTION_BASE) {
      throw new Error('Supabase Edge Functions URL not configured');
    }

    const requestBody: any = {
      type: 'subscription',
      subscription_plan: plan,
      user_id: session.user.id,
    };

    // Only include URLs if provided (backend will use defaults if not provided)
    if (options?.successUrl) {
      requestBody.success_url = options.successUrl;
    }
    if (options?.cancelUrl) {
      requestBody.cancel_url = options.cancelUrl;
    }

    const response = await fetch(`${EDGE_FUNCTION_BASE}/create-checkout-session`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      // Try to get error details from response
      let errorMessage = 'Failed to create checkout session';
      let errorDetails: any = null;

      try {
        const errorText = await response.text();
        try {
          errorDetails = JSON.parse(errorText);
          errorMessage = errorDetails.error || errorDetails.message || errorMessage;
        } catch {
          // Response is not JSON, might be HTML or plain text
          errorMessage = `Backend error (${response.status} ${response.statusText}): ${errorText.substring(0, 200)}`;
        }
      } catch (e) {
        errorMessage = `Backend error: ${response.status} ${response.statusText}`;
      }

      console.error('Checkout session creation failed:', {
        status: response.status,
        statusText: response.statusText,
        errorDetails,
        url: `${EDGE_FUNCTION_BASE}/create-checkout-session`,
      });

      throw new Error(errorMessage);
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

/**
 * Payment history record
 */
export interface PaymentHistoryItem {
  id: string;
  user_id: string;
  type: 'credits' | 'subscription';
  credits?: number;
  amount: number;
  currency: string;
  status: string;
  stripe_payment_intent_id?: string;
  stripe_session_id?: string;
  created_at: string;
}

/**
 * Get payment history for the current user
 * @param limit - Maximum number of records to return (default: 20)
 * @returns Array of payment history items
 */
export async function getPaymentHistory(limit: number = 20): Promise<{
  payments: PaymentHistoryItem[];
  error: any | null;
}> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      return { payments: [], error: { message: 'Not authenticated' } };
    }

    const { data: payments, error } = await supabase
      .from('stripe_payments')
      .select('*')
      .eq('user_id', session.user.id)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw error;

    return { payments: payments || [], error: null };
  } catch (error: any) {
    console.error('Error fetching payment history:', error);
    return { payments: [], error };
  }
}
