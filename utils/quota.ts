import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Quota modal configuration
 */
export const QUOTA_THRESHOLD = 3; // Number of listings before showing modal
export const QUOTA_MODAL_DISMISSAL_DAYS = 7; // Days to remember dismissal

/**
 * Check if quota modal should be shown
 * @param userId - User ID
 * @param listingCount - Current number of listings saved
 * @returns true if modal should be shown, false otherwise
 */
export async function checkQuotaModalShouldShow(
  userId: string,
  listingCount: number,
): Promise<boolean> {
  // Only show if user has reached or exceeded threshold
  if (listingCount < QUOTA_THRESHOLD) {
    return false;
  }

  // Check if modal was dismissed recently
  const dismissalKey = `quota_modal_dismissed_${userId}`;
  const dismissalTimestamp = await AsyncStorage.getItem(dismissalKey);

  if (!dismissalTimestamp) {
    // Never dismissed, show modal
    return true;
  }

  // Check if dismissal has expired
  const dismissalDate = new Date(parseInt(dismissalTimestamp, 10));
  const now = new Date();
  const daysSinceDismissal = Math.floor(
    (now.getTime() - dismissalDate.getTime()) / (1000 * 60 * 60 * 24),
  );

  // Show modal again if dismissal period has passed
  return daysSinceDismissal >= QUOTA_MODAL_DISMISSAL_DAYS;
}

/**
 * Mark quota modal as dismissed for a user
 * @param userId - User ID
 */
export async function markQuotaModalDismissed(userId: string): Promise<void> {
  const dismissalKey = `quota_modal_dismissed_${userId}`;
  const timestamp = Date.now().toString();
  await AsyncStorage.setItem(dismissalKey, timestamp);
}

/**
 * Clear quota modal dismissal (for testing or reset)
 * @param userId - User ID
 */
export async function clearQuotaModalDismissal(userId: string): Promise<void> {
  const dismissalKey = `quota_modal_dismissed_${userId}`;
  await AsyncStorage.removeItem(dismissalKey);
}

/**
 * Get the time period string for quota modal
 * Currently defaults to "week" but can be made dynamic based on quota reset logic
 * @returns Time period string (e.g., "week", "month")
 */
export function getQuotaPeriod(): string {
  // TODO: Make this dynamic based on backend quota reset logic
  // For now, default to "week"
  return 'week';
}
