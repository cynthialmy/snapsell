import AsyncStorage from '@react-native-async-storage/async-storage';
import type { AnonymousQuota } from './listings-api';

const ANONYMOUS_QUOTA_KEY = 'anonymous_quota';
const LAST_QUOTA_CHECK_DATE_KEY = 'last_quota_check_date';

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

/**
 * Get the current date as a string (YYYY-MM-DD) for comparison
 */
function getCurrentDateString(): string {
  const now = new Date();
  return now.toISOString().split('T')[0]; // Returns YYYY-MM-DD
}

/**
 * Check if it's a new day since the last quota check
 * Returns true if:
 * - No last check date is stored, OR
 * - Current date is different from last check date
 */
export async function isNewDay(): Promise<boolean> {
  try {
    const lastCheckDate = await AsyncStorage.getItem(LAST_QUOTA_CHECK_DATE_KEY);
    const currentDate = getCurrentDateString();

    if (!lastCheckDate) {
      // No previous check, treat as new day
      return true;
    }

    // Compare dates (YYYY-MM-DD format)
    const isNew = lastCheckDate !== currentDate;

    if (isNew) {
      console.log('[Quota Storage] New day detected:', {
        lastCheckDate,
        currentDate,
      });
    }

    return isNew;
  } catch (error) {
    console.warn('[Quota Storage] Failed to check if new day:', error);
    // On error, assume it's a new day to be safe (will force refresh)
    return true;
  }
}

/**
 * Update the last quota check date to the current date
 */
export async function updateLastQuotaCheckDate(): Promise<void> {
  try {
    const currentDate = getCurrentDateString();
    await AsyncStorage.setItem(LAST_QUOTA_CHECK_DATE_KEY, currentDate);
    console.log('[Quota Storage] Updated last quota check date:', currentDate);
  } catch (error) {
    console.warn('[Quota Storage] Failed to update last quota check date:', error);
  }
}

/**
 * Clear the last quota check date (for testing or reset)
 */
export async function clearLastQuotaCheckDate(): Promise<void> {
  try {
    await AsyncStorage.removeItem(LAST_QUOTA_CHECK_DATE_KEY);
  } catch (error) {
    console.warn('[Quota Storage] Failed to clear last quota check date:', error);
  }
}
