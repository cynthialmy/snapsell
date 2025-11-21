import PostHog from 'posthog-react-native';
import { Platform } from 'react-native';

const POSTHOG_API_KEY = process.env.EXPO_PUBLIC_POSTHOG_API_KEY;
const POSTHOG_HOST = process.env.EXPO_PUBLIC_POSTHOG_HOST;
const POSTHOG_DEBUG = process.env.EXPO_PUBLIC_POSTHOG_DEBUG?.toLowerCase() === 'true';

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
        // Log configuration status (without exposing secrets)
        const hasApiKey = !!POSTHOG_API_KEY;
        const hasHost = !!POSTHOG_HOST;
        const apiKeyLength = POSTHOG_API_KEY?.length || 0;

        console.log(`[PostHog] Initialization check:`, {
            platform: Platform.OS,
            hasApiKey,
            hasHost,
            apiKeyLength,
            host: POSTHOG_HOST || 'not set',
            debug: POSTHOG_DEBUG,
        });

        if (!POSTHOG_API_KEY || !POSTHOG_HOST) {
            console.warn(
                `[PostHog] Credentials not configured. Analytics will be disabled. ` +
                `API Key: ${hasApiKey ? 'set' : 'missing'}, Host: ${hasHost ? 'set' : 'missing'}`
            );
            isInitialized = true;
            return;
        }

        try {
            // Configure PostHog with aggressive flushing for production builds
            // flushAt: 1 means send events immediately (no batching)
            // flushInterval: 10000ms as fallback to ensure events are sent even if flushAt fails
            posthogInstance = new PostHog(POSTHOG_API_KEY, {
                host: POSTHOG_HOST,
                // Disable session replay for now to avoid issues on devices
                enableSessionReplay: false,
                // Force immediate event sending (no batching)
                flushAt: 1,
                // Fallback: flush every 10 seconds to ensure events are sent
                flushInterval: 10000,
            });

            console.log(`[PostHog] SDK instance created, waiting for ready state...`);

            // Wait for PostHog to be ready before marking as initialized
            await posthogInstance.ready();
            isInitialized = true;
            console.log(`[PostHog] Initialized successfully on ${Platform.OS} with host: ${POSTHOG_HOST}`);
        } catch (error) {
            // Don't break the app if PostHog fails to initialize
            const errorMessage = error instanceof Error ? error.message : String(error);
            const errorStack = error instanceof Error ? error.stack : undefined;
            console.error('[PostHog] Failed to initialize:', {
                message: errorMessage,
                stack: errorStack,
                platform: Platform.OS,
                host: POSTHOG_HOST,
            });
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
            console.warn(`[PostHog] Not initialized. Event "${eventName}" not tracked.`);
            return;
        }

        // Log what we're sending for debugging
        if (POSTHOG_DEBUG) {
            console.log(`[PostHog] Tracking event: ${eventName}`, properties);
        }

        posthogInstance.capture(eventName, properties);

        // Flush events immediately on all platforms to ensure they're sent
        // This is especially important for production builds where events might be queued
        posthogInstance.flush().catch((error) => {
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.warn(`[PostHog] Flush failed for event "${eventName}":`, errorMessage);
        });
    } catch (error) {
        // Don't break the app if tracking fails
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`[PostHog] Failed to track event "${eventName}":`, errorMessage);
    }
}

/**
 * Get the PostHog client instance (for advanced usage)
 */
export function getPostHog(): PostHog | null {
    return posthogInstance;
}
