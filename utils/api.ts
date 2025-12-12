import { Platform } from 'react-native';
import { trackError } from './analytics';
import { supabase } from './auth';

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

type AnalyzeOptions = {
  uri: string;
  filename?: string;
  mimeType?: string;
  provider?: string;
  model?: string;
  currency?: string;
  onStatusChange?: (message: string | null) => void;
};

const HOSTED_BACKEND_URL = 'https://snapsell-backend.onrender.com';
const ALLOW_DEVICE_LOCALHOST =
  process.env.EXPO_PUBLIC_ALLOW_DEVICE_LOCALHOST?.toLowerCase() === 'true';

// Get Supabase Edge Function URL
function getEdgeFunctionUrl(): string | null {
  const functionsUrl = process.env.EXPO_PUBLIC_SUPABASE_FUNCTIONS_URL;
  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;

  if (functionsUrl) {
    return functionsUrl;
  }

  if (supabaseUrl) {
    return `${supabaseUrl}/functions/v1`;
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

// Helper function to check if an error is retryable
function isRetryableError(error: unknown, response?: Response): boolean {
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

const REQUEST_TIMEOUT_MS = 20_000;
const TIMEOUT_RETRY_DELAY_MS = 2_000;

async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit & { timeoutMs?: number } = {},
): Promise<Response> {
  const { timeoutMs = REQUEST_TIMEOUT_MS, signal, ...rest } = init;
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

export async function analyzeItemPhoto(options: AnalyzeOptions): Promise<ListingData> {
  const {
    uri,
    filename = 'snapsell-item.jpg',
    mimeType = 'image/jpeg',
    provider,
    model,
    currency,
    onStatusChange,
  } = options;

  const maxAttempts = 3; // 1 initial + 2 retries
  let lastError: Error | null = null;
  let lastResponse: Response | undefined = undefined;

  onStatusChange?.(null);

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      // Determine endpoint URL
      const endpointUrl = USE_EDGE_FUNCTION
        ? `${EDGE_FUNCTION_URL}/analyze-image`
        : `${API_URL}/api/analyze-image`;

      console.log('Uploading image to:', endpointUrl);
      console.log('Platform:', Platform.OS);
      if (attempt > 1) {
        console.log(`Retry attempt ${attempt - 1} of ${maxAttempts - 1}`);
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
          }
          // If no session, don't include auth header - backend should allow unauthenticated access
        } catch (authError) {
          // Silently fail - Edge Function should work without auth for analyze-image
          console.warn('Failed to get auth token (continuing without auth):', authError);
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

      const response = await fetchWithTimeout(endpointUrl, {
        method: 'POST',
        body: formData,
        headers,
        timeoutMs: REQUEST_TIMEOUT_MS,
      });

      lastResponse = response;
      console.log(`[API] Response status: ${response.status} ${response.statusText}`);

      if (!response.ok) {
        // Try to parse error response as JSON (Supabase Edge Functions return JSON errors)
        let errorMessage = 'Failed to analyze photo. Please try again.';
        try {
          const errorData = await response.json();
          errorMessage = errorData.detail || errorData.error || errorData.message || errorMessage;
        } catch {
          // If JSON parsing fails, try as text
          const text = await response.text();
          errorMessage = text || errorMessage;
        }
        const error = new Error(errorMessage);
        lastError = error;

        // Track API error
        trackError('api_error', error, {
          endpoint: endpointUrl,
          status_code: response.status,
          attempt,
          max_attempts: maxAttempts,
        });

        // Check if this error is retryable
        if (isRetryableError(error, response) && attempt < maxAttempts) {
          // Wait before retrying (1 second delay)
          await delay(1000);
          continue;
        }

        throw error;
      }

      const json = (await response.json()) as ListingData;
      console.log('[API] Successfully received listing data');
      onStatusChange?.(null);
      return json;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.log(`[API] Error on attempt ${attempt}/${maxAttempts}:`, errorMessage);

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
      trackError('api_error', lastError, {
        endpoint: endpointUrl,
        attempt,
        max_attempts: maxAttempts,
      });
      throw lastError;
    }
  }

  // This should never be reached, but TypeScript needs it
  throw lastError || new Error("Snappy tried his best but couldn't process the photo. Please try again.");
}
