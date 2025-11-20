import PostHog from 'posthog-react-native';

const POSTHOG_API_KEY = process.env.EXPO_PUBLIC_POSTHOG_API_KEY;
const POSTHOG_HOST = process.env.EXPO_PUBLIC_POSTHOG_HOST;

let posthogInitialized = false;

/**
 * Initialize PostHog analytics client
 * Should be called once in the app root layout
 */
export async function initializePostHog(): Promise<void> {
    if (posthogInitialized) {
        return;
    }

    if (!POSTHOG_API_KEY || !POSTHOG_HOST) {
        console.warn('PostHog credentials not configured. Analytics will be disabled.');
        return;
    }

    try {
        await PostHog.initAsync(POSTHOG_API_KEY, {
            host: POSTHOG_HOST,
            person_profiles: 'identified_only',
        });
        posthogInitialized = true;
    } catch (error) {
        // Don't break the app if PostHog fails to initialize
        console.error('Failed to initialize PostHog:', error);
    }
}

/**
 * Track an event with optional properties
 */
export function trackEvent(eventName: string, properties?: Record<string, any>): void {
    try {
        if (posthogInitialized) {
            PostHog.capture(eventName, properties);
        }
    } catch (error) {
        // Don't break the app if tracking fails
        console.error('Failed to track event:', error);
    }
}

/**
 * Get the PostHog client instance (for advanced usage)
 */
export function getPostHog(): typeof PostHog {
    return PostHog;
}
