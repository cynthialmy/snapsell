import { Platform } from 'react-native';

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
};

const HOSTED_BACKEND_URL = 'https://snapsell-backend.onrender.com';
const ALLOW_DEVICE_LOCALHOST =
  process.env.EXPO_PUBLIC_ALLOW_DEVICE_LOCALHOST?.toLowerCase() === 'true';

function isLoopbackUrl(value: string): boolean {
  const lower = value.toLowerCase();
  return (
    lower.includes('localhost') ||
    lower.includes('127.0.0.1') ||
    lower.includes('::1') ||
    lower.includes('10.0.2.2')
  );
}

// Get API URL, replacing localhost with the local network IP for mobile devices
function getApiUrl(): string {
  const envUrl = process.env.EXPO_PUBLIC_API_URL;
  if (envUrl) {
    if (Platform.OS !== 'web' && !ALLOW_DEVICE_LOCALHOST && isLoopbackUrl(envUrl)) {
      console.warn(
        `EXPO_PUBLIC_API_URL points to ${envUrl}, which isn't reachable from physical devices. ` +
        `Defaulting to hosted backend at ${HOSTED_BACKEND_URL}. Set EXPO_PUBLIC_ALLOW_DEVICE_LOCALHOST=true if you really want to use a local network tunnel.`,
      );
      return HOSTED_BACKEND_URL;
    }
    // If explicitly set (and allowed), use it
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

const API_URL = getApiUrl();

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

export async function analyzeItemPhoto(options: AnalyzeOptions): Promise<ListingData> {
  const { uri, filename = 'snapsell-item.jpg', mimeType = 'image/jpeg', provider, model } = options;

  const maxAttempts = 3; // 1 initial + 2 retries
  let lastError: Error | null = null;
  let lastResponse: Response | undefined = undefined;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      console.log('Uploading image to:', `${API_URL}/api/analyze-image`);
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

      // On React Native, don't set Content-Type header - let the system set it with boundary
      const headers: HeadersInit = {
        Accept: 'application/json',
      };

      // Only set Content-Type on web
      if (Platform.OS === 'web') {
        // FormData will be handled automatically by fetch on web
      }

      const response = await fetch(`${API_URL}/api/analyze-image`, {
        method: 'POST',
        body: formData,
        headers,
      });

      lastResponse = response;

      if (!response.ok) {
        const message = await response.text();
        const error = new Error(message || 'Failed to analyze photo. Please try again.');
        lastError = error;

        // Check if this error is retryable
        if (isRetryableError(error, response) && attempt < maxAttempts) {
          // Wait before retrying (1 second delay)
          await delay(1000);
          continue;
        }

        throw error;
      }

      const json = (await response.json()) as ListingData;
      return json;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Check if this error is retryable
      if (isRetryableError(error, lastResponse) && attempt < maxAttempts) {
        // Wait before retrying (1 second delay)
        await delay(1000);
        continue;
      }

      // If not retryable or all retries exhausted, handle the error
      const errorMessage = lastError.message;
      const isNetworkError =
        error instanceof TypeError ||
        errorMessage.toLowerCase().includes('network') ||
        errorMessage.toLowerCase().includes('fetch') ||
        errorMessage.toLowerCase().includes('failed') ||
        errorMessage.toLowerCase().includes('connection');

      if (isNetworkError) {
        const isLocalhost = API_URL.includes('localhost') || API_URL.includes('127.0.0.1');
        if (Platform.OS !== 'web' && isLocalhost) {
          throw new Error(
            `Cannot connect to backend. On mobile devices, localhost won't work. Please set EXPO_PUBLIC_API_URL in your .env file to a reachable backend (defaults to ${HOSTED_BACKEND_URL}).`
          );
        }
        throw new Error(
          `Network request failed. Cannot connect to backend at ${API_URL}. Please check:\n\n` +
          '1. Your internet connection\n' +
          '2. The backend server is running and accessible\n' +
          '3. EXPO_PUBLIC_API_URL is set correctly in your .env file'
        );
      }
      throw lastError;
    }
  }

  // This should never be reached, but TypeScript needs it
  throw lastError || new Error('Failed to analyze photo after multiple attempts.');
}
