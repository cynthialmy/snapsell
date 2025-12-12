/**
 * SnapSell - Supabase Authentication
 *
 * This file provides authentication functions using Supabase Auth.
 */

import { createClient } from '@supabase/supabase-js';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as SecureStore from 'expo-secure-store';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';

// Initialize Supabase client
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const SUPABASE_PUBLISHABLE_KEY = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY || '';

if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
  console.warn('Supabase credentials not configured. Authentication will not work.');
}

// Custom storage adapter for Expo SecureStore
const ExpoSecureStoreAdapter = {
  getItem: (key: string) => {
    return SecureStore.getItemAsync(key);
  },
  setItem: (key: string, value: string) => {
    return SecureStore.setItemAsync(key, value);
  },
  removeItem: (key: string) => {
    return SecureStore.deleteItemAsync(key);
  },
};

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    storage: ExpoSecureStoreAdapter,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true, // Enable to automatically extract session from URL hash fragments
  },
});

// ============================================
// Authentication Functions
// ============================================

/**
 * Sign up with email and password
 */
export async function signUp(email: string, password: string, displayName?: string) {
  try {
    // Get deep link scheme from environment or use default (matches app.json scheme)
    const deepLinkScheme = process.env.EXPO_PUBLIC_DEEP_LINK_SCHEME || 'snapsell';
    const emailRedirectTo = `${deepLinkScheme}://auth/callback`;

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo,
        data: {
          display_name: displayName || email.split('@')[0],
        },
      },
    });

    if (error) throw error;

    return { data, error: null };
  } catch (error: any) {
    console.error('Sign up error:', error);
    return { data: null, error };
  }
}

/**
 * Sign in with email and password
 */
export async function signIn(email: string, password: string) {
  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) throw error;

    return { data, error: null };
  } catch (error: any) {
    console.error('Sign in error:', error);
    return { data: null, error };
  }
}

/**
 * Sign in with magic link (passwordless)
 */
export async function signInWithMagicLink(email: string) {
  try {
    // Get deep link scheme from environment or use default (matches app.json scheme)
    const deepLinkScheme = process.env.EXPO_PUBLIC_DEEP_LINK_SCHEME || 'snapsell';
    const emailRedirectTo = `${deepLinkScheme}://auth/callback`;

    const { data, error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo,
      },
    });

    if (error) throw error;

    return { data, error: null };
  } catch (error: any) {
    console.error('Magic link error:', error);
    return { data: null, error };
  }
}

/**
 * Sign in with Google OAuth
 * Opens Supabase OAuth URL in web browser, redirects back to app via deep link
 */
export async function signInWithGoogle() {
  try {
    // Get deep link scheme from environment or use default
    const deepLinkScheme = process.env.EXPO_PUBLIC_DEEP_LINK_SCHEME || 'snapsell';
    const redirectTo = `${deepLinkScheme}://auth/callback`;

    // Construct Supabase OAuth URL
    const authUrl = `${SUPABASE_URL}/auth/v1/authorize?provider=google&redirect_to=${encodeURIComponent(redirectTo)}`;

    // Open OAuth URL in browser
    const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectTo);

    if (result.type === 'cancel') {
      return { data: null, error: { message: 'Sign in cancelled' } };
    }

    if (result.type === 'success' && result.url) {
      // The deep link handler in _layout.tsx will process the callback
      // Extract tokens from URL to verify the flow started
      const url = result.url;
      const hashIndex = url.indexOf('#');

      if (hashIndex !== -1) {
        const hashFragment = url.substring(hashIndex + 1);
        const hashParams = new URLSearchParams(hashFragment);
        const accessToken = hashParams.get('access_token');

        if (accessToken) {
          // Session will be set by the deep link handler
          // Return success to indicate OAuth flow completed
          return { data: { user: null }, error: null };
        }
      }

      // If we get here, the callback was received but tokens weren't in the URL
      // The deep link handler should have processed it, so return success
      return { data: { user: null }, error: null };
    }

    return { data: null, error: { message: 'OAuth flow failed' } };
  } catch (error: any) {
    console.error('Google sign in error:', error);
    return { data: null, error };
  }
}

/**
 * Sign in with Apple OAuth
 * iOS: Uses native Sign in with Apple, then exchanges credential with Supabase
 * Android: Falls back to web-based OAuth (same as Google)
 */
export async function signInWithApple() {
  try {
    // Get deep link scheme from environment or use default
    const deepLinkScheme = process.env.EXPO_PUBLIC_DEEP_LINK_SCHEME || 'snapsell';
    const redirectTo = `${deepLinkScheme}://auth/callback`;

    if (Platform.OS === 'ios') {
      // Use native Sign in with Apple on iOS
      try {
        const credential = await AppleAuthentication.signInAsync({
          requestedScopes: [
            AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
            AppleAuthentication.AppleAuthenticationScope.EMAIL,
          ],
        });

        if (!credential.identityToken) {
          return { data: null, error: { message: 'Apple sign in failed: no identity token' } };
        }

        // Exchange Apple credential with Supabase
        const { data, error } = await supabase.auth.signInWithIdToken({
          provider: 'apple',
          token: credential.identityToken,
          nonce: credential.nonce || undefined,
        });

        if (error) throw error;

        return { data, error: null };
      } catch (error: any) {
        // Handle user cancellation
        if (error.code === 'ERR_REQUEST_CANCELED') {
          return { data: null, error: { message: 'Sign in cancelled' } };
        }
        throw error;
      }
    } else {
      // Android: Use web-based OAuth (same as Google)
      const authUrl = `${SUPABASE_URL}/auth/v1/authorize?provider=apple&redirect_to=${encodeURIComponent(redirectTo)}`;

      const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectTo);

      if (result.type === 'cancel') {
        return { data: null, error: { message: 'Sign in cancelled' } };
      }

      if (result.type === 'success' && result.url) {
        // The deep link handler in _layout.tsx will process the callback
        const url = result.url;
        const hashIndex = url.indexOf('#');

        if (hashIndex !== -1) {
          const hashFragment = url.substring(hashIndex + 1);
          const hashParams = new URLSearchParams(hashFragment);
          const accessToken = hashParams.get('access_token');

          if (accessToken) {
            return { data: { user: null }, error: null };
          }
        }

        return { data: { user: null }, error: null };
      }

      return { data: null, error: { message: 'OAuth flow failed' } };
    }
  } catch (error: any) {
    console.error('Apple sign in error:', error);
    return { data: null, error };
  }
}

/**
 * Sign out current user
 */
export async function signOut() {
  try {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;

    // Clear any additional stored data if needed
    await SecureStore.deleteItemAsync('supabase_session');

    return { error: null };
  } catch (error: any) {
    console.error('Sign out error:', error);
    return { error };
  }
}

/**
 * Get current authenticated user
 */
export async function getUser() {
  try {
    const { data: { user }, error } = await supabase.auth.getUser();

    if (error) throw error;

    return { user, error: null };
  } catch (error: any) {
    // Don't log "Auth session missing" errors - this is normal when not signed in
    if (error?.name !== 'AuthSessionMissingError' && error?.message !== 'Auth session missing!') {
      console.error('Get user error:', error);
    }
    return { user: null, error };
  }
}

/**
 * Get current session
 */
export async function getSession() {
  try {
    const { data: { session }, error } = await supabase.auth.getSession();

    if (error) throw error;

    return { session, error: null };
  } catch (error: any) {
    console.error('Get session error:', error);
    return { session: null, error };
  }
}

/**
 * Get user profile from users_profile table
 */
export async function getUserProfile() {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { profile: null, error: { message: 'Not authenticated' } };
    }

    const { data: profile, error } = await supabase
      .from('users_profile')
      .select('*')
      .eq('id', user.id)
      .single();

    if (error) throw error;

    return { profile, error: null };
  } catch (error: any) {
    console.error('Get profile error:', error);
    return { profile: null, error };
  }
}

/**
 * Update user profile
 */
export async function updateUserProfile(updates: {
  display_name?: string;
  avatar_url?: string;
  metadata?: any;
}) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { profile: null, error: { message: 'Not authenticated' } };
    }

    const { data: profile, error } = await supabase
      .from('users_profile')
      .update(updates)
      .eq('id', user.id)
      .select()
      .single();

    if (error) throw error;

    return { profile, error: null };
  } catch (error: any) {
    console.error('Update profile error:', error);
    return { profile: null, error };
  }
}

/**
 * Delete user account
 * Calls Supabase Edge Function to delete account and all associated data
 */
export async function deleteAccount() {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { error: { message: 'Not authenticated' } };
    }

    // Call Supabase Edge Function to delete account
    const { data, error } = await supabase.functions.invoke('delete-account', {
      method: 'POST',
    });

    if (error) throw error;

    // If deletion was successful, sign out the user
    await supabase.auth.signOut();
    await SecureStore.deleteItemAsync('supabase_session');

    return { data, error: null };
  } catch (error: any) {
    console.error('Delete account error:', error);
    return { data: null, error };
  }
}

/**
 * Listen to auth state changes
 * Useful for updating UI when user signs in/out
 */
export function onAuthStateChange(callback: (user: any) => void) {
  return supabase.auth.onAuthStateChange((event, session) => {
    callback(session?.user || null);
  });
}
