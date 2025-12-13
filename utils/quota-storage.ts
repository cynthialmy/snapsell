import AsyncStorage from '@react-native-async-storage/async-storage';
import type { AnonymousQuota } from './listings-api';

const ANONYMOUS_QUOTA_KEY = 'anonymous_quota';

/**
 * Store anonymous quota from API response
 * This is used to share quota between screens since backend /anonymous-quota endpoint
 * doesn't track per-device quota and returns stale data
 */
export async function storeAnonymousQuota(quota: AnonymousQuota): Promise<void> {
  try {
    await AsyncStorage.setItem(ANONYMOUS_QUOTA_KEY, JSON.stringify(quota));
  } catch (error) {
    console.warn('[Quota Storage] Failed to store anonymous quota:', error);
  }
}

/**
 * Retrieve stored anonymous quota
 * Returns null if not found or expired (older than 24 hours)
 */
export async function getStoredAnonymousQuota(): Promise<AnonymousQuota | null> {
  try {
    const data = await AsyncStorage.getItem(ANONYMOUS_QUOTA_KEY);
    if (!data) {
      return null;
    }

    const quota: AnonymousQuota = JSON.parse(data);

    // Check if quota is expired (older than 24 hours)
    if (quota.resets_at) {
      const resetTime = new Date(quota.resets_at).getTime();
      const now = Date.now();
      if (now >= resetTime) {
        // Quota has expired, remove it
        await AsyncStorage.removeItem(ANONYMOUS_QUOTA_KEY);
        return null;
      }
    }

    return quota;
  } catch (error) {
    console.warn('[Quota Storage] Failed to retrieve anonymous quota:', error);
    return null;
  }
}

/**
 * Clear stored anonymous quota
 */
export async function clearStoredAnonymousQuota(): Promise<void> {
  try {
    await AsyncStorage.removeItem(ANONYMOUS_QUOTA_KEY);
  } catch (error) {
    console.warn('[Quota Storage] Failed to clear anonymous quota:', error);
  }
}
