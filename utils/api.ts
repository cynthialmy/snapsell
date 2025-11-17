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

  // On mobile, localhost won't work - user needs to set EXPO_PUBLIC_API_URL to their computer's IP
  if (Platform.OS !== 'web') {
    console.warn(
      'EXPO_PUBLIC_API_URL not set. On mobile devices, set it to your computer\'s IP address (e.g., http://192.168.1.100:8000)'
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
    const normalizedUri =
      Platform.OS === 'ios' && uri.startsWith('file://') ? uri.replace('file://', '') : uri;

    formData.append('image', {
      uri: normalizedUri,
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
    const response = await fetch(`${API_URL}/api/analyze-image`, {
      method: 'POST',
      body: formData,
      headers: {
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      const message = await response.text();
      throw new Error(message || 'Failed to analyze photo. Please try again.');
    }

    const json = (await response.json()) as ListingData;
    return json;
  } catch (error) {
    if (error instanceof TypeError && error.message.includes('fetch')) {
      // Network error - likely backend not running or wrong URL
      const isLocalhost = API_URL.includes('localhost') || API_URL.includes('127.0.0.1');
      if (Platform.OS !== 'web' && isLocalhost) {
        throw new Error(
          'Cannot connect to backend. On mobile devices, set EXPO_PUBLIC_API_URL in .env to your computer\'s IP address (e.g., http://192.168.1.100:8000). Make sure the backend server is running.'
        );
      }
      throw new Error(
        'Cannot connect to backend server. Make sure it\'s running on ' + API_URL
      );
    }
    throw error;
  }
}
