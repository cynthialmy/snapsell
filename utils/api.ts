import { Platform } from 'react-native';
import { trackError } from './analytics';
import { supabase } from './auth';
import type { UserQuota } from './listings-api';

export type ListingData = {
  title: string;
  price: string;
  description: string;
  condition: string;
  location: string;
  brand?: string;
  pickupAvailable?: boolean;
  shippingAvailable?: boolean;
  pickupNotes?: string;
};

export type AnalyzeImageResponse = {
  listing: ListingData;
  quota?: UserQuota | null;
};

type AnalyzeOptions = {
  uri: string;
  filename?: string;
  mimeType?: string;
  provider?: string;
  model?: string;
  currency?: string;
  onStatusChange?: (message: string | null) => void;
  signal?: AbortSignal;
};

const HOSTED_BACKEND_URL = 'https://snapsell-backend.onrender.com';
const ALLOW_DEVICE_LOCALHOST =
  process.env.EXPO_PUBLIC_ALLOW_DEVICE_LOCALHOST?.toLowerCase() === 'true';

// Get Supabase Edge Function URL
function getEdgeFunctionUrl(): string | null {
  const functionsUrl = process.env.EXPO_PUBLIC_SUPABASE_FUNCTIONS_URL;
  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;

  if (functionsUrl) {
    // Remove trailing slashes to avoid double slashes when appending paths
    return functionsUrl.replace(/\/+$/, '');
  }

  if (supabaseUrl) {
    // Remove trailing slashes from supabaseUrl before appending /functions/v1
    const cleanSupabaseUrl = supabaseUrl.replace(/\/+$/, '');
    return `${cleanSupabaseUrl}/functions/v1`;
  }

  return null;
}

// Get API URL - prefer Supabase Edge Function, fallback to legacy FastAPI backend
function getApiUrl(): string {
  // First, try to use Supabase Edge Function
  const edgeFunctionUrl = getEdgeFunctionUrl();
  if (edgeFunctionUrl) {
    return edgeFunctionUrl;
  }

  // Fallback to legacy FastAPI backend
  const envUrl = process.env.EXPO_PUBLIC_API_URL;
  if (envUrl) {
    if (Platform.OS !== 'web' && !ALLOW_DEVICE_LOCALHOST && isLoopbackUrl(envUrl)) {
      console.warn(
        `EXPO_PUBLIC_API_URL points to ${envUrl}, which isn't reachable from physical devices. ` +
        `Defaulting to hosted backend at ${HOSTED_BACKEND_URL}. Set EXPO_PUBLIC_ALLOW_DEVICE_LOCALHOST=true if you really want to use a local network tunnel.`,
      );
      return HOSTED_BACKEND_URL;
    }
    return envUrl;
  }

  // Default to localhost for web, but mobile devices should use hosted backend
  const defaultUrl = Platform.OS === 'web' ? 'http://localhost:8000' : HOSTED_BACKEND_URL;

  // On mobile, localhost won't work - default to hosted backend unless overridden
  if (Platform.OS !== 'web') {
    console.warn(
      `EXPO_PUBLIC_API_URL not set. Using hosted backend at ${HOSTED_BACKEND_URL}. Set EXPO_PUBLIC_API_URL if you need a different endpoint (e.g., your local tunnel).`
    );
  }

  return defaultUrl;
}

function isLoopbackUrl(value: string): boolean {
  const lower = value.toLowerCase();
  return (
    lower.includes('localhost') ||
    lower.includes('127.0.0.1') ||
    lower.includes('::1') ||
    lower.includes('10.0.2.2')
  );
}

const API_URL = getApiUrl();
const EDGE_FUNCTION_URL = getEdgeFunctionUrl();
const USE_EDGE_FUNCTION = EDGE_FUNCTION_URL !== null;

// Log configuration at module load time for debugging
console.log('[API Config] API_URL:', API_URL);
console.log('[API Config] EDGE_FUNCTION_URL:', EDGE_FUNCTION_URL);
console.log('[API Config] USE_EDGE_FUNCTION:', USE_EDGE_FUNCTION);
console.log('[API Config] EXPO_PUBLIC_SUPABASE_URL:', process.env.EXPO_PUBLIC_SUPABASE_URL || 'NOT SET');
console.log('[API Config] EXPO_PUBLIC_SUPABASE_FUNCTIONS_URL:', process.env.EXPO_PUBLIC_SUPABASE_FUNCTIONS_URL || 'NOT SET');

// Helper function to check if an error is retryable
function isRetryableError(error: unknown, response?: Response): boolean {
  // Rate limit errors (429) are not retryable - user needs to wait
  if (response && response.status === 429) {
    return false;
  }

  // Quota exceeded errors (402) are not retryable
  if (response && response.status === 402) {
    return false;
  }

  // Network errors are retryable
  if (error instanceof TypeError) {
    return true;
  }

  // Check if it's a network-related error message
  if (error instanceof Error) {
    const errorMessage = error.message.toLowerCase();
    if (
      errorMessage.includes('network') ||
      errorMessage.includes('fetch') ||
      errorMessage.includes('failed') ||
      errorMessage.includes('connection') ||
      errorMessage.includes('timeout')
    ) {
      return true;
    }
  }

  // 5xx server errors are retryable, but not 4xx client errors
  if (response && response.status >= 500 && response.status < 600) {
    return true;
  }

  return false;
}

// Helper function to delay execution
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Cute messages for Snappy the Otter
const WARMUP_MESSAGES = [
  'Snappy is napping. Waking him up...',
  'Snappy is stretching his paws...',
  'Snappy is brewing some coffee...',
  'Snappy is rubbing the sleep from his eyes...',
  'Snappy is doing his morning stretches...',
  'Snappy is getting ready for you...',
  'Snappy is warming up his otter engine...',
];

const TIMEOUT_MESSAGES = [
  "Snappy couldn't wake up because he partied too hard last night...",
  'Snappy is still snoozing. Give him a moment...',
  "Snappy is taking a longer nap than expected...",
  "Snappy is having a deep sleep. Let's try again...",
  "Snappy is dreaming about fish. We'll wake him up...",
  "Snappy is in a deep slumber. One more try...",
];

function getRandomWarmupMessage(): string {
  return WARMUP_MESSAGES[Math.floor(Math.random() * WARMUP_MESSAGES.length)];
}

function getRandomTimeoutMessage(): string {
  return TIMEOUT_MESSAGES[Math.floor(Math.random() * TIMEOUT_MESSAGES.length)];
}

// Edge Functions with LLM calls can take 30-60+ seconds, especially with cold starts
// Use longer timeout for Edge Functions, shorter for legacy backend
// Edge Functions with LLM calls can take 30-60+ seconds, especially with cold starts
// Legacy backend typically responds faster
const DEFAULT_TIMEOUT_MS = 20_000;
const EDGE_FUNCTION_TIMEOUT_MS = 60_000;
const TIMEOUT_RETRY_DELAY_MS = 2_000;

async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit & { timeoutMs?: number } = {},
): Promise<Response> {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, signal, ...rest } = init;
  const controller = new AbortController();

  const timeoutId = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  const cleanup = () => {
    clearTimeout(timeoutId);
  };

  if (signal) {
    if (signal.aborted) {
      cleanup();
      controller.abort();
    } else {
      signal.addEventListener('abort', () => controller.abort(), { once: true });
    }
  }

  try {
    return await fetch(input, {
      ...rest,
      signal: controller.signal,
    });
  } finally {
    cleanup();
  }
}

function isAbortError(error: unknown): boolean {
  if (!error) {
    return false;
  }
  if (typeof DOMException !== 'undefined' && error instanceof DOMException && error.name === 'AbortError') {
    return true;
  }
  if (error instanceof Error) {
    return error.name === 'AbortError' || error.message.toLowerCase().includes('aborted');
  }
  return false;
}

export async function analyzeItemPhoto(options: AnalyzeOptions): Promise<AnalyzeImageResponse> {
  const {
    uri,
    filename = 'snapsell-item.jpg',
    mimeType = 'image/jpeg',
    provider,
    model,
    currency,
    onStatusChange,
    signal,
  } = options;

  const maxAttempts = 3; // 1 initial + 2 retries
  let lastError: Error | null = null;
  let lastResponse: Response | undefined = undefined;

  // Determine endpoint URL once (used in error tracking)
  const baseUrl = USE_EDGE_FUNCTION ? EDGE_FUNCTION_URL : API_URL;
  const cleanBaseUrl = baseUrl?.replace(/\/+$/, '') || '';
  const endpointUrl = USE_EDGE_FUNCTION
    ? `${cleanBaseUrl}/analyze-image`
    : `${cleanBaseUrl}/api/analyze-image`;

  onStatusChange?.(null);

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {

      console.log('[API] Uploading image to:', endpointUrl);
      console.log('[API] Platform:', Platform.OS);
      console.log('[API] Using Edge Function:', USE_EDGE_FUNCTION);
      console.log('[API] Edge Function URL:', EDGE_FUNCTION_URL);
      console.log('[API] API URL:', API_URL);
      if (attempt > 1) {
        console.log(`[API] Retry attempt ${attempt - 1} of ${maxAttempts - 1}`);
      }

      // Create FormData fresh for each attempt to avoid any potential issues
      const formData = new FormData();
      if (Platform.OS === 'web') {
        const response = await fetch(uri);
        const blob = await response.blob();
        formData.append('image', blob, filename);
      } else {
        // For React Native, use the URI as-is
        // iOS: can work with or without file:// prefix
        // Android: typically needs file:// prefix
        // The FormData implementation will handle it correctly
        formData.append('image', {
          uri: uri,
          name: filename,
          type: mimeType,
        } as any);
      }

      if (provider) {
        formData.append('provider', provider);
      }

      if (model) {
        formData.append('model', model);
      }

      if (currency) {
        formData.append('currency', currency);
      }

      // Get authentication token if available (for Supabase Edge Functions)
      // Note: analyze-image endpoint should work without auth for unauthenticated users
      let authHeaders: HeadersInit = {};
      if (USE_EDGE_FUNCTION) {
        try {
          const { data: { session } } = await supabase.auth.getSession();
          if (session?.access_token) {
            authHeaders = {
              Authorization: `Bearer ${session.access_token}`,
            };
            console.log('[API] Auth token found, length:', session.access_token.length);
          } else {
            console.log('[API] No session found, proceeding without auth');
          }
          // If no session, don't include auth header - backend should allow unauthenticated access
        } catch (authError) {
          // Silently fail - Edge Function should work without auth for analyze-image
          console.warn('[API] Failed to get auth token (continuing without auth):', authError);
        }
      }

      // On React Native, don't set Content-Type header - let the system set it with boundary
      const headers: HeadersInit = {
        Accept: 'application/json',
        ...authHeaders,
      };

      // Only set Content-Type on web
      if (Platform.OS === 'web') {
        // FormData will be handled automatically by fetch on web
      }

      // Use longer timeout for Edge Functions (LLM calls can take 30-60+ seconds)
      const timeoutMs = USE_EDGE_FUNCTION ? EDGE_FUNCTION_TIMEOUT_MS : DEFAULT_TIMEOUT_MS;
      console.log('[API] Making fetch request...');
      console.log(`[API] Timeout: ${timeoutMs}ms (${USE_EDGE_FUNCTION ? 'Edge Function' : 'Legacy backend'})`);
      // Pass user's abort signal to fetchWithTimeout
      // fetchWithTimeout will combine it with its own timeout signal
      const response = await fetchWithTimeout(endpointUrl, {
        method: 'POST',
        body: formData,
        headers,
        timeoutMs,
        signal: signal,
      });

      lastResponse = response;
      console.log(`[API] Response status: ${response.status} ${response.statusText}`);
      console.log(`[API] Response headers:`, Object.fromEntries(response.headers.entries()));

      if (!response.ok) {
        // Try to parse error response as JSON (Supabase Edge Functions return JSON errors)
        let errorMessage = 'Failed to analyze photo. Please try again.';
        let errorData: any = {};
        try {
          errorData = await response.json();
          errorMessage = errorData.detail || errorData.error || errorData.message || errorMessage;
        } catch {
          // If JSON parsing fails, try as text
          const text = await response.text();
          errorMessage = text || errorMessage;
        }

        // Handle quota exceeded (402) - attach quota info to error
        if (response.status === 402) {
          const quotaError: any = new Error(errorMessage);
          quotaError.code = 'QUOTA_EXCEEDED';
          quotaError.creations_remaining_today = errorData.creations_remaining_today ?? 0;
          quotaError.creations_daily_limit = errorData.creations_daily_limit ?? 0;
          quotaError.bonus_creations_remaining = errorData.bonus_creations_remaining ?? 0;
          quotaError.resets_at = errorData.resets_at;
          lastError = quotaError;
        }
        // Handle rate limit (429) - attach quota info to error
        else if (response.status === 429) {
          const rateLimitError: any = new Error(errorMessage);
          rateLimitError.code = errorData.code || 'RATE_LIMIT_EXCEEDED';
          rateLimitError.remaining = errorData.remaining ?? 0;
          rateLimitError.limit = errorData.limit ?? 10;
          rateLimitError.retry_after = errorData.retry_after;
          rateLimitError.resets_at = errorData.resets_at;
          // Also include quota fields for consistency
          rateLimitError.creations_remaining_today = errorData.creations_remaining_today ?? errorData.remaining ?? 0;
          rateLimitError.creations_daily_limit = errorData.creations_daily_limit ?? errorData.limit ?? 10;
          lastError = rateLimitError;
        } else {
          const error = new Error(errorMessage);
          lastError = error;
        }

        // Track API error
        if (lastError) {
          trackError('api_error', lastError, {
            endpoint: endpointUrl,
            status_code: response.status,
            attempt,
            max_attempts: maxAttempts,
          });
        }

        // Check if this error is retryable
        if (isRetryableError(lastError, response) && attempt < maxAttempts) {
          // Wait before retrying (1 second delay)
          await delay(1000);
          continue;
        }

        throw lastError;
      }

      const responseData = await response.json();
      console.log('[API] Successfully received listing data');
      console.log('[API] Full response data keys:', Object.keys(responseData));
      console.log('[API] Response quota object:', JSON.stringify(responseData.quota, null, 2));

      // Extract quota if present (for both authenticated and unauthenticated users)
      const quota = responseData.quota || null;
      if (quota) {
        console.log('[API] Extracted quota details:', {
          creations_remaining_today: quota.creations_remaining_today,
          creations_daily_limit: quota.creations_daily_limit,
          bonus_creations_remaining: quota.bonus_creations_remaining ?? 0,
          save_slots_remaining: quota.save_slots_remaining ?? 0,
          is_pro: quota.is_pro ?? false,
          resets_at: quota.resets_at,
          // Verify required fields exist
          has_required_fields: typeof quota.creations_remaining_today === 'number' &&
            typeof quota.creations_daily_limit === 'number',
          all_quota_keys: Object.keys(quota),
        });

        // Warn if required fields are missing
        if (typeof quota.creations_remaining_today !== 'number' ||
          typeof quota.creations_daily_limit !== 'number') {
          console.warn('[API] Quota object missing required fields!', {
            received_keys: Object.keys(quota),
            quota_object: quota,
          });
        }
      } else {
        console.log('[API] No quota in response');
      }

      const listing: ListingData = {
        title: responseData.title || '',
        price: responseData.price || '',
        description: responseData.description || '',
        condition: responseData.condition || '',
        location: responseData.location || '',
        brand: responseData.brand,
        pickupAvailable: responseData.pickupAvailable,
        shippingAvailable: responseData.shippingAvailable,
        pickupNotes: responseData.pickupNotes,
      };

      console.log('[API] Response includes quota:', !!quota);
      onStatusChange?.(null);
      return { listing, quota };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.log(`[API] Error on attempt ${attempt}/${maxAttempts}:`, errorMessage);

      // Check if this is a user cancellation (not a timeout)
      if (isAbortError(error) && signal?.aborted) {
        console.log('[API] Request cancelled by user');
        const cancelError = new Error('Analysis cancelled');
        cancelError.name = 'CancelledError';
        throw cancelError;
      }

      if (isAbortError(error)) {
        const timeoutMessage = getRandomTimeoutMessage();
        lastError = new Error(timeoutMessage);
        onStatusChange?.(getRandomWarmupMessage());

        if (attempt < maxAttempts) {
          console.log(`[API] Retrying after timeout...`);
          await delay(TIMEOUT_RETRY_DELAY_MS);
          continue;
        }

        throw lastError;
      }

      lastError = error instanceof Error ? error : new Error(String(error));

      // Check if this error is retryable
      if (isRetryableError(error, lastResponse) && attempt < maxAttempts) {
        console.log(`[API] Retryable error, retrying in 1 second...`);
        // Wait before retrying (1 second delay)
        await delay(1000);
        continue;
      }

      // If not retryable or all retries exhausted, handle the error
      const finalErrorMessage = lastError.message;
      const isNetworkError =
        error instanceof TypeError ||
        finalErrorMessage.toLowerCase().includes('network') ||
        finalErrorMessage.toLowerCase().includes('fetch') ||
        finalErrorMessage.toLowerCase().includes('failed') ||
        finalErrorMessage.toLowerCase().includes('connection');

      if (isNetworkError) {
        trackError('network_error', lastError, {
          endpoint: endpointUrl,
          attempt,
          max_attempts: maxAttempts,
        });
        const isLocalhost = API_URL.includes('localhost') || API_URL.includes('127.0.0.1');
        if (Platform.OS !== 'web' && isLocalhost) {
          throw new Error(
            "Snappy can't find the server on your phone. Please check your settings or try again later."
          );
        }
        throw new Error(
          "Snappy can't reach the server right now. Check your internet connection and try again."
        );
      }
      // Track other errors
      if (lastError) {
        trackError('api_error', lastError, {
          endpoint: endpointUrl,
          attempt,
          max_attempts: maxAttempts,
        });
      }
      throw lastError;
    }
  }

  // This should never be reached, but TypeScript needs it
  throw lastError || new Error("Snappy tried his best but couldn't process the photo. Please try again.");
}
