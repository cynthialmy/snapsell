import PostHog from 'posthog-react-native';
import { Platform } from 'react-native';

const POSTHOG_API_KEY = process.env.EXPO_PUBLIC_POSTHOG_API_KEY;
const POSTHOG_HOST = process.env.EXPO_PUBLIC_POSTHOG_HOST;

let posthogInstance: PostHog | null = null;
let isInitialized = false;
let initPromise: Promise<void> | null = null;

/**
 * Initialize PostHog analytics client
 * Should be called once in the app root layout
 */
export async function initializePostHog(): Promise<void> {
    if (posthogInstance || isInitialized) {
        return;
    }

    // If initialization is already in progress, wait for it
    if (initPromise) {
        return initPromise;
    }

    initPromise = (async () => {
        if (!POSTHOG_API_KEY || !POSTHOG_HOST) {
            console.warn('PostHog credentials not configured. Analytics will be disabled.');
            isInitialized = true;
            return;
        }

        try {
            posthogInstance = new PostHog(POSTHOG_API_KEY, {
                host: POSTHOG_HOST,
                // Disable session replay for now to avoid issues on devices
                enableSessionReplay: false,
            });

            // Wait for PostHog to be ready before marking as initialized
            await posthogInstance.ready();
            isInitialized = true;
            console.log(`PostHog initialized successfully on ${Platform.OS}`);
        } catch (error) {
            // Don't break the app if PostHog fails to initialize
            console.error('Failed to initialize PostHog:', error);
            isInitialized = true; // Mark as initialized to prevent retries
        }
    })();

    return initPromise;
}

/**
 * Track an event with optional properties
 */
export function trackEvent(eventName: string, properties?: Record<string, any>): void {
    try {
        if (!posthogInstance) {
            console.warn(`PostHog not initialized. Event "${eventName}" not tracked.`);
            return;
        }

        // Log what we're sending for debugging
        console.log(`[PostHog] Tracking event: ${eventName}`, properties);

        posthogInstance.capture(eventName, properties);

        // Flush events immediately on iOS devices to ensure they're sent
        if (Platform.OS === 'ios') {
            posthogInstance.flush().catch((error) => {
                console.warn('PostHog flush failed:', error);
            });
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
