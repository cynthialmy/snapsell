import PostHog from 'posthog-react-native';

const POSTHOG_API_KEY = process.env.EXPO_PUBLIC_POSTHOG_API_KEY;
const POSTHOG_HOST = process.env.EXPO_PUBLIC_POSTHOG_HOST;

let posthogInstance: PostHog | null = null;

/**
 * Initialize PostHog analytics client
 * Should be called once in the app root layout
 */
export function initializePostHog(): void {
    if (posthogInstance) {
        return;
    }

    if (!POSTHOG_API_KEY || !POSTHOG_HOST) {
        console.warn('PostHog credentials not configured. Analytics will be disabled.');
        return;
    }

    try {
        posthogInstance = new PostHog(POSTHOG_API_KEY, {
            host: POSTHOG_HOST,
            // Enable session recording for all platforms (web, iOS, Android)
            enableSessionReplay: true,
            // Enable console log capture for web (React Native SDK handles platform differences)
            enable_recording_console_log: true,
            // Configure session replay settings including console log capture
            sessionReplayConfig: {
                // Enable capturing of console logs (Android: logcat, iOS/Web: console logs)
                captureLog: true,
            },
        });
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
        if (posthogInstance) {
            posthogInstance.capture(eventName, properties);
        }
    } catch (error) {
        // Don't break the app if tracking fails
        console.error('Failed to track event:', error);
    }
}

/**
 * Get the PostHog client instance (for advanced usage)
 */
export function getPostHog(): PostHog | null {
    return posthogInstance;
}
