import { Platform } from 'react-native';

export type ListingData = {
  title: string;
  price: string;
  description: string;
  condition: string;
  location: string;
};

type AnalyzeOptions = {
  uri: string;
  filename?: string;
  mimeType?: string;
  provider?: string;
  model?: string;
};

// Get API URL, replacing localhost with the local network IP for mobile devices
function getApiUrl(): string {
  const envUrl = process.env.EXPO_PUBLIC_API_URL;
  if (envUrl) {
    // If explicitly set, use it
    return envUrl;
  }

  // Default to localhost for web, but mobile devices need the local network IP
  const defaultUrl = 'http://localhost:8000';

  // On mobile, localhost won't work - user needs to set EXPO_PUBLIC_API_URL to the hosted backend URL
  if (Platform.OS !== 'web') {
    console.warn(
      'EXPO_PUBLIC_API_URL not set. Set it to your hosted backend URL (e.g., https://snapsell-backend.onrender.com)'
    );
  }

  return defaultUrl;
}

const API_URL = getApiUrl();

export async function analyzeItemPhoto(options: AnalyzeOptions): Promise<ListingData> {
  const { uri, filename = 'snapsell-item.jpg', mimeType = 'image/jpeg', provider, model } = options;

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

  try {
    console.log('Uploading image to:', `${API_URL}/api/analyze-image`);
    console.log('Platform:', Platform.OS);

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

    if (!response.ok) {
      const message = await response.text();
      throw new Error(message || 'Failed to analyze photo. Please try again.');
    }

    const json = (await response.json()) as ListingData;
    return json;
  } catch (error) {
    // Handle network errors (including "network request failed")
    const errorMessage = error instanceof Error ? error.message : String(error);
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
          'Cannot connect to backend. On mobile devices, localhost won\'t work. Please set EXPO_PUBLIC_API_URL in your .env file to your hosted backend URL (e.g., https://snapsell-backend.onrender.com).'
        );
      }
      throw new Error(
        `Network request failed. Cannot connect to backend at ${API_URL}. Please check:\n\n` +
        '1. Your internet connection\n' +
        '2. The backend server is running and accessible\n' +
        '3. EXPO_PUBLIC_API_URL is set correctly in your .env file'
      );
    }
    throw error;
  }
}
