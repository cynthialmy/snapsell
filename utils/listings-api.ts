/**
 * SnapSell - Backend Listings API
 *
 * This file provides functions to interact with listings, upload images,
 * generate AI content, and share listings using Supabase Edge Functions.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import * as ImagePicker from 'expo-image-picker';
import { trackError } from './analytics';
import { supabase } from './auth';
import { clearListings, loadListings } from './listings';

// Edge Function base URL
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const EDGE_FUNCTION_BASE_RAW = process.env.EXPO_PUBLIC_SUPABASE_FUNCTIONS_URL ||
  (SUPABASE_URL ? `${SUPABASE_URL}/functions/v1` : null);

// Normalize URL to remove trailing slashes and prevent double slashes in path
// Keep protocol double slashes (http://) but remove path double slashes
const EDGE_FUNCTION_BASE = EDGE_FUNCTION_BASE_RAW
  ? EDGE_FUNCTION_BASE_RAW.replace(/\/+$/, '').replace(/([^:]\/)\/+/g, '$1')
  : null;

// Validate configuration (but don't throw in production to allow graceful degradation)
if (!EDGE_FUNCTION_BASE) {
  console.warn(
    'Missing Supabase configuration. Please set EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_FUNCTIONS_URL in your environment variables.'
  );
} else {
  console.log('[Config] Edge Function Base URL:', EDGE_FUNCTION_BASE);
}

// ============================================
// Image Upload
// ============================================

/**
 * Pick an image from device and convert to base64
 */
export async function pickImage(): Promise<string | null> {
  try {
    // Request permissions
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      throw new Error('Permission to access media library denied');
    }

    // Pick image
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.8,
      base64: true,
    });

    if (result.canceled || !result.assets[0]) {
      return null;
    }

    const asset = result.assets[0];
    const base64 = `data:image/jpeg;base64,${asset.base64}`;
    return base64;
  } catch (error) {
    console.error('Image pick error:', error);
    return null;
  }
}

/**
 * Upload image to Supabase Storage via Edge Function
 */
export async function uploadImage(base64Image: string, contentType: string = 'image/jpeg') {
  try {
    // Check if backend is configured
    if (!EDGE_FUNCTION_BASE) {
      console.error('[Upload] Backend not configured - EDGE_FUNCTION_BASE is missing');
      throw new Error('Backend not configured');
    }

    console.log('[Upload] Backend URL:', EDGE_FUNCTION_BASE);
    console.log('[Upload] Upload endpoint:', `${EDGE_FUNCTION_BASE}/upload`);
    console.log('[Upload] Image size:', base64Image.length, 'bytes');
    console.log('[Upload] Content type:', contentType);

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      console.error('[Upload] Not authenticated - no session');
      throw new Error('Not authenticated');
    }

    console.log('[Upload] Session found, access token length:', session.access_token?.length || 0);

    const uploadUrl = `${EDGE_FUNCTION_BASE}/upload`;
    console.log('[Upload] Making request to:', uploadUrl);

    const response = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        file: base64Image,
        contentType,
      }),
    });

    console.log('[Upload] Response status:', response.status, response.statusText);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Upload] Error response body:', errorText);

      let errorData;
      try {
        errorData = JSON.parse(errorText);
      } catch {
        errorData = { error: errorText || 'Upload failed' };
      }

      console.error('[Upload] Parsed error data:', errorData);
      const error = new Error(errorData.error || `Upload failed with status ${response.status}`);
      trackError('api_error', error, {
        endpoint: 'upload',
        status_code: response.status,
      });
      throw error;
    }

    const responseText = await response.text();
    console.log('[Upload] Success response body length:', responseText.length);

    let data;
    try {
      data = JSON.parse(responseText);
    } catch (parseError) {
      console.error('[Upload] Failed to parse response as JSON:', parseError);
      const error = new Error('Invalid response from server');
      trackError('api_error', error, {
        endpoint: 'upload',
        error_type: 'parse_error',
      });
      throw error;
    }

    console.log('[Upload] Upload successful, storage_path:', data.storage_path);
    return { data, error: null };
  } catch (error: any) {
    console.error('[Upload] Upload error:', error);
    console.error('[Upload] Error message:', error?.message);
    console.error('[Upload] Error stack:', error?.stack);
    const err = error instanceof Error ? error : new Error(String(error));
    trackError('api_error', err, {
      endpoint: 'upload',
    });
    return { data: null, error: err };
  }
}

// ============================================
// AI Generation
// ============================================

/**
 * Generate listing content from uploaded image
 */
export async function generateListingContent(storagePath: string) {
  try {
    // Check if backend is configured
    if (!EDGE_FUNCTION_BASE) {
      throw new Error('Backend not configured');
    }

    const { data: { session } } = await supabase.auth.getSession();

    const response = await fetch(`${EDGE_FUNCTION_BASE}/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(session && { 'Authorization': `Bearer ${session.access_token}` }),
      },
      body: JSON.stringify({
        storage_path: storagePath,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Generation failed' }));

      // Handle quota exceeded (402)
      if (response.status === 402 && errorData.code === 'QUOTA_EXCEEDED') {
        const quotaError: any = new Error(errorData.message || 'Quota exceeded');
        quotaError.code = 'QUOTA_EXCEEDED';
        quotaError.creations_remaining_today = errorData.creations_remaining_today ?? 0;
        quotaError.bonus_creations_remaining = errorData.bonus_creations_remaining ?? 0;
        throw quotaError;
      }

      throw new Error(errorData.error || errorData.message || `Generation failed with status ${response.status}`);
    }

    const data = await response.json();
    return { data, error: null };
  } catch (error: any) {
    console.error('Generation error:', error);
    return { data: null, error };
  }
}

// ============================================
// Listing Management
// ============================================

export interface CreateListingParams {
  title: string;
  description?: string; // Optional for migration compatibility
  price_cents?: number; // Optional for migration compatibility
  currency?: string;
  condition?: string;
  category?: string;
  tags?: string[];
  storage_path: string;
  thumbnail_path?: string;
  ai_generated?: any;
  visibility?: 'private' | 'shared' | 'public';
}

/**
 * Create a new listing (with quota enforcement)
 */
export async function createListing(params: CreateListingParams) {
  try {
    // Check if backend is configured
    if (!EDGE_FUNCTION_BASE) {
      console.error('[CreateListing] Backend not configured - EDGE_FUNCTION_BASE is missing');
      throw new Error('Backend not configured');
    }

    console.log('[CreateListing] Backend URL:', EDGE_FUNCTION_BASE);
    console.log('[CreateListing] Create endpoint:', `${EDGE_FUNCTION_BASE}/listings-create`);
    console.log('[CreateListing] Params:', {
      title: params.title,
      description: params.description?.substring(0, 50) + '...',
      price_cents: params.price_cents,
      currency: params.currency,
      condition: params.condition,
      storage_path: params.storage_path || '(none)',
      visibility: params.visibility,
    });

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      console.error('[CreateListing] Not authenticated - no session');
      throw new Error('Not authenticated');
    }

    console.log('[CreateListing] Session found, access token length:', session.access_token?.length || 0);

    const createUrl = `${EDGE_FUNCTION_BASE}/listings-create`;
    console.log('[CreateListing] Making request to:', createUrl);

    const response = await fetch(createUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
      },
      body: JSON.stringify(params),
    });

    console.log('[CreateListing] Response status:', response.status, response.statusText);

    const responseText = await response.text();
    console.log('[CreateListing] Response body length:', responseText.length);
    console.log('[CreateListing] Response body preview:', responseText.substring(0, 200));

    let data;
    try {
      data = JSON.parse(responseText);
      console.log('[CreateListing] Parsed response keys:', Object.keys(data));
      console.log('[CreateListing] Full parsed response:', JSON.stringify(data, null, 2));
    } catch (parseError) {
      console.error('[CreateListing] Failed to parse response as JSON:', parseError);
      console.error('[CreateListing] Raw response:', responseText);
      throw new Error('Invalid response from server');
    }

    if (!response.ok) {
      // Log error details for debugging
      console.error('[CreateListing] Error response:', {
        status: response.status,
        error: data.error,
        details: data.details,
        type: data.type,
      });

      // Handle save slots exceeded (402)
      if (response.status === 402) {
        const errorCode = data.code || (data.error?.includes('save') ? 'SAVE_SLOTS_EXCEEDED' : 'QUOTA_EXCEEDED');
        return {
          listing: null,
          error: {
            code: errorCode,
            message: data.message || data.error || 'Quota exceeded',
            save_slots_remaining: data.save_slots_remaining ?? 0,
            ...data,
          },
        };
      }

      // Handle 500 errors (backend bugs) - log but don't expose technical details to user
      if (response.status >= 500) {
        console.error('[CreateListing] Backend error (500+):', {
          status: response.status,
          error: data.error,
          details: data.details,
          type: data.type,
        });
        return {
          listing: null,
          error: {
            message: 'Backend service error. Please try again later.',
            details: data.details || data.error || 'Internal server error',
            code: data.code,
            status: response.status,
            ...data,
          },
        };
      }

      // Return detailed error information for other errors
      const errorMessage = data.error || 'Failed to create listing';
      const errorDetails = data.details || data.message || '';

      return {
        listing: null,
        error: {
          message: errorMessage,
          details: errorDetails,
          code: data.code,
          ...data,
        },
      };
    }

    console.log('[CreateListing] Success! Listing ID:', data.listing?.id);
    console.log('[CreateListing] Response structure:', {
      hasListing: !!data.listing,
      hasQuota: !!data.quota,
      listingKeys: data.listing ? Object.keys(data.listing) : [],
      quotaKeys: data.quota ? Object.keys(data.quota) : [],
    });

    const result = { listing: data.listing, quota: data.quota || null, error: null };
    console.log('[CreateListing] Returning:', {
      hasListing: !!result.listing,
      hasQuota: !!result.quota,
      listingId: result.listing?.id,
      error: result.error,
    });
    return result;
  } catch (error: any) {
    console.error('[CreateListing] Create listing error:', error);
    console.error('[CreateListing] Error message:', error?.message);
    console.error('[CreateListing] Error stack:', error?.stack);
    return { listing: null, error };
  }
}

/**
 * Get listing by share slug (public, no auth required)
 */
export async function getListingBySlug(slug: string) {
  try {
    const response = await fetch(`${EDGE_FUNCTION_BASE}/listings-get-by-slug/${slug}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Listing not found');
    }

    const data = await response.json();
    return { listing: data, error: null };
  } catch (error: any) {
    console.error('Get listing error:', error);
    return { listing: null, error };
  }
}

/**
 * Get listing by ID (requires authentication)
 */
export async function getListingById(listingId: string) {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      throw new Error('Not authenticated');
    }

    const { data: listing, error } = await supabase
      .from('listings')
      .select('*')
      .eq('id', listingId)
      .single();

    if (error) throw error;

    return { listing, error: null };
  } catch (error: any) {
    console.error('Get listing by ID error:', error);
    return { listing: null, error };
  }
}

/**
 * Get user's listings
 */
export async function getMyListings() {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      throw new Error('Not authenticated');
    }

    // Fetch fresh listings - Supabase doesn't cache by default, but we ensure fresh data
    const { data: listings, error } = await supabase
      .from('listings')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;

    return { listings, error: null };
  } catch (error: any) {
    console.error('Get listings error:', error);
    return { listings: null, error };
  }
}

/**
 * Update a listing
 */
export async function updateListing(listingId: string, updates: Partial<CreateListingParams>) {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      throw new Error('Not authenticated');
    }

    // First verify the listing exists and belongs to the user
    const { data: existingListing, error: checkError } = await supabase
      .from('listings')
      .select('id, user_id')
      .eq('id', listingId)
      .single();

    if (checkError || !existingListing) {
      throw checkError || new Error('Listing not found');
    }

    // Verify ownership (RLS should handle this, but explicit check helps debug)
    if (existingListing.user_id !== session.user.id) {
      throw new Error('Not authorized to update this listing');
    }

    const { data: listing, error } = await supabase
      .from('listings')
      .update(updates)
      .eq('id', listingId)
      .select()
      .single();

    if (error) throw error;

    return { listing, error: null };
  } catch (error: any) {
    console.error('Update listing error:', error);
    return { listing: null, error };
  }
}

/**
 * Delete a listing
 */
export async function deleteListing(listingId: string) {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      throw new Error('Not authenticated');
    }

    const { error } = await supabase
      .from('listings')
      .delete()
      .eq('id', listingId);

    if (error) throw error;

    return { error: null };
  } catch (error: any) {
    console.error('Delete listing error:', error);
    return { error };
  }
}

// ============================================
// Full Flow: Upload → Generate → Create
// ============================================

/**
 * Complete flow: Pick image, upload, generate, and create listing
 * Note: This uses Supabase Edge Functions for upload/generate, but we may
 * need to adapt this to work with the existing FastAPI backend for generation.
 */
export async function createListingFromImage(
  imageBase64: string,
  visibility: 'private' | 'shared' | 'public' = 'shared'
) {
  try {
    // Step 1: Upload image
    const { data: uploadData, error: uploadError } = await uploadImage(imageBase64);
    if (uploadError || !uploadData) {
      throw new Error('Failed to upload image');
    }

    // Step 2: Generate listing content
    const { data: genData, error: genError } = await generateListingContent(uploadData.storage_path);
    if (genError || !genData) {
      throw new Error('Failed to generate content');
    }

    // Step 3: Create listing
    const { listing, error: createError } = await createListing({
      title: genData.title,
      description: genData.description || undefined,
      price_cents: genData.price_cents || undefined,
      currency: genData.currency || 'USD',
      condition: genData.condition || undefined,
      category: genData.category || undefined,
      tags: genData.tags || [],
      storage_path: uploadData.storage_path,
      ai_generated: genData.ai_generated,
      visibility,
    });

    if (createError) {
      throw createError;
    }

    return { listing, error: null };
  } catch (error: any) {
    console.error('Create listing from image error:', error);
    return { listing: null, error };
  }
}

// ============================================
// Usage & Quota
// ============================================

/**
 * Anonymous quota response structure (for non-logged-in users)
 */
export interface AnonymousQuota {
  creations_used_today: number;
  creations_remaining_today: number;
  creations_daily_limit: number;
  resets_at: string;
}

/**
 * User quota response structure
 */
export interface UserQuota {
  user_id: string;
  is_pro: boolean;
  // New detailed breakdown (preferred)
  creations?: {
    free_remaining_today: number;
    purchased_remaining: number;
    total_remaining: number;
    daily_limit: number;
  };
  saves?: {
    free_slots: number;
    purchased_slots: number;
    total_slots: number;
  };
  // Legacy fields (for backward compatibility)
  creations_remaining_today: number;
  creations_daily_limit: number;
  bonus_creations_remaining: number;
  save_slots_remaining: number;
  free_save_slots: number;
  resets_at: string;
}

/**
 * Check anonymous quota (for non-logged-in users)
 * Uses /anonymous-quota endpoint
 */
export async function checkAnonymousQuota(): Promise<{ quota: AnonymousQuota | null; error: any | null }> {
  try {
    // Check if Edge Function URL is configured
    if (!EDGE_FUNCTION_BASE || EDGE_FUNCTION_BASE.includes('YOUR_') || EDGE_FUNCTION_BASE.includes('your_')) {
      // Backend not configured yet - return null quota silently
      return { quota: null, error: { message: 'Backend not configured' } };
    }

    const response = await fetch(`${EDGE_FUNCTION_BASE}/anonymous-quota`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      // Try to parse error, but handle cases where response isn't JSON
      let errorMessage = 'Failed to check anonymous quota';
      let errorDetails: any = null;
      try {
        const error = await response.json();
        errorMessage = error.error || error.message || errorMessage;
        errorDetails = error.details || error.error || null;
      } catch {
        errorMessage = `Server error (${response.status})`;
      }

      // Log detailed error for debugging
      if (response.status >= 500) {
        console.error('Check anonymous quota backend error:', {
          status: response.status,
          message: errorMessage,
          details: errorDetails,
        });
      } else if (response.status < 500) {
        console.warn('Check anonymous quota error:', errorMessage);
      }

      return { quota: null, error: { message: errorMessage, details: errorDetails, status: response.status } };
    }

    const data: AnonymousQuota = await response.json();
    return { quota: data, error: null };
  } catch (error: any) {
    // Don't log network errors or backend unavailable errors - these are expected during setup
    const errorMessage = error?.message || 'Failed to check anonymous quota';
    const isNetworkError = errorMessage.includes('fetch') ||
      errorMessage.includes('network') ||
      errorMessage.includes('Failed to fetch');

    if (!isNetworkError) {
      console.warn('Check anonymous quota error:', errorMessage);
    }

    return { quota: null, error: { message: errorMessage } };
  }
}

/**
 * Check current usage and quota (for logged-in users)
 * Uses new /user-quota endpoint
 */
export async function checkQuota(): Promise<{ quota: UserQuota | null; error: any | null }> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      return { quota: null, error: { message: 'Not authenticated' } };
    }

    // Check if Edge Function URL is configured
    if (!EDGE_FUNCTION_BASE || EDGE_FUNCTION_BASE.includes('YOUR_') || EDGE_FUNCTION_BASE.includes('your_')) {
      // Backend not configured yet - return null quota silently
      return { quota: null, error: { message: 'Backend not configured' } };
    }

    const response = await fetch(`${EDGE_FUNCTION_BASE}/user-quota`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
      },
    });

    if (!response.ok) {
      // Try to parse error, but handle cases where response isn't JSON
      let errorMessage = 'Failed to check quota';
      let errorDetails: any = null;
      try {
        const error = await response.json();
        errorMessage = error.error || error.message || errorMessage;
        errorDetails = error.details || error.error || null;
      } catch {
        errorMessage = `Server error (${response.status})`;
      }

      // Log detailed error for debugging (especially 500 errors which indicate backend issues)
      if (response.status >= 500) {
        console.error('Check quota backend error:', {
          status: response.status,
          message: errorMessage,
          details: errorDetails,
        });
      } else if (response.status < 500) {
        console.warn('Check quota error:', errorMessage);
      }

      return { quota: null, error: { message: errorMessage, details: errorDetails, status: response.status } };
    }

    const data: UserQuota = await response.json();
    return { quota: data, error: null };
  } catch (error: any) {
    // Don't log network errors or backend unavailable errors - these are expected during setup
    const errorMessage = error?.message || 'Failed to check quota';
    const isNetworkError = errorMessage.includes('fetch') ||
      errorMessage.includes('network') ||
      errorMessage.includes('Failed to fetch');

    if (!isNetworkError) {
      console.warn('Check quota error:', errorMessage);
    }

    return { quota: null, error: { message: errorMessage } };
  }
}

// ============================================
// Feedback
// ============================================

/**
 * Submit feedback
 */
export async function submitFeedback(params: {
  type: 'app' | 'listing';
  listing_id?: string;
  rating?: number;
  comment: string;
  attachment?: string;
  attachment_filename?: string;
}) {
  try {
    const { data: { session } } = await supabase.auth.getSession();

    const response = await fetch(`${EDGE_FUNCTION_BASE}/feedback-create`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(session && { 'Authorization': `Bearer ${session.access_token}` }),
      },
      body: JSON.stringify(params),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to submit feedback');
    }

    const data = await response.json();
    return { feedback: data.feedback, error: null };
  } catch (error: any) {
    console.error('Submit feedback error:', error);
    return { feedback: null, error };
  }
}

// ============================================
// Migration: Local to Backend
// ============================================

// Migration lock to prevent concurrent migrations
let migrationInProgress = false;

/**
 * Convert image URI to base64 string
 */
async function imageUriToBase64(uri: string): Promise<string | null> {
  try {
    // Handle data URIs (already base64)
    if (uri.startsWith('data:')) {
      return uri;
    }

    // Check if file exists and is readable
    try {
      const fileInfo = await FileSystem.getInfoAsync(uri);
      if (!fileInfo.exists) {
        console.warn('Image file does not exist:', uri);
        return null;
      }
    } catch (infoError) {
      // If we can't check file info, try to read anyway
      console.warn('Could not check file info:', uri, infoError);
    }

    // Read file and convert to base64
    const base64 = await FileSystem.readAsStringAsync(uri, {
      encoding: 'base64',
    });

    if (!base64) {
      console.warn('Image file is empty:', uri);
      return null;
    }

    // Determine content type from URI or default to jpeg
    let contentType = 'image/jpeg';
    if (uri.includes('.png')) {
      contentType = 'image/png';
    } else if (uri.includes('.webp')) {
      contentType = 'image/webp';
    }

    return `data:${contentType};base64,${base64}`;
  } catch (error: any) {
    // More specific error handling
    if (error?.code === 'ERR_FILE_NOT_READABLE') {
      console.warn('Image file is not readable (may have been deleted):', uri);
    } else {
      console.error('Error converting image to base64:', error?.message || error, uri);
    }
    return null;
  }
}

/**
 * Check if migration has been completed for a user
 */
async function hasMigrationCompleted(userId: string): Promise<boolean> {
  try {
    const key = `@snapsell:migration_completed:${userId}`;
    const value = await AsyncStorage.getItem(key);
    return value === 'true';
  } catch (error) {
    console.error('Error checking migration status:', error);
    return false;
  }
}

/**
 * Mark migration as completed for a user
 */
async function markMigrationCompleted(userId: string): Promise<void> {
  try {
    const key = `@snapsell:migration_completed:${userId}`;
    await AsyncStorage.setItem(key, 'true');
  } catch (error) {
    console.error('Error marking migration as completed:', error);
  }
}

/**
 * Migrate local listings to backend
 * This function:
 * 1. Checks if migration has already been done
 * 2. Loads local listings from AsyncStorage
 * 3. Uploads images and creates listings in Supabase
 * 4. Clears local listings after successful migration
 * 5. Marks migration as complete
 */
export async function migrateLocalListingsToBackend(): Promise<{
  migrated: number;
  failed: number;
  skipped: boolean;
  error: any;
}> {
  // Prevent concurrent migrations
  if (migrationInProgress) {
    console.log('[Migration] Migration already in progress, skipping...');
    return { migrated: 0, failed: 0, skipped: true, error: null };
  }

  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session || !session.user) {
      return { migrated: 0, failed: 0, skipped: true, error: null };
    }

    const userId = session.user.id;

    // Check if migration already completed
    if (await hasMigrationCompleted(userId)) {
      // If migration is complete, ensure local listings are cleared to prevent re-migration
      const localListings = await loadListings();
      if (localListings.length > 0) {
        console.log('[Migration] Migration already completed, but local listings still exist. Clearing them...');
        await clearListings();
      }
      return { migrated: 0, failed: 0, skipped: true, error: null };
    }

    // Set migration lock
    migrationInProgress = true;

    // Load local listings
    const localListings = await loadListings();
    if (localListings.length === 0) {
      // No local listings to migrate, mark as complete
      await markMigrationCompleted(userId);
      return { migrated: 0, failed: 0, skipped: true, error: null };
    }

    let migrated = 0;
    let failed = 0;
    const errors: any[] = [];

    // Migrate each listing
    for (const localListing of localListings) {
      try {
        let storagePath = '';
        let imageUploadFailed = false;

        // Upload image if it exists
        if (localListing.imageUri) {
          try {
            const base64Image = await imageUriToBase64(localListing.imageUri);
            if (base64Image) {
              const { data: uploadData, error: uploadError } = await uploadImage(base64Image);
              if (uploadError || !uploadData?.storage_path) {
                console.warn('Failed to upload image for listing:', localListing.id, uploadError?.message || 'No storage path returned');
                imageUploadFailed = true;
              } else {
                storagePath = uploadData.storage_path;
              }
            } else {
              console.warn('Could not convert image to base64 for listing:', localListing.id);
              imageUploadFailed = true;
            }
          } catch (imageError: any) {
            // File might be deleted or unreadable - log but continue
            console.warn('Error processing image for listing:', localListing.id, imageError?.message || imageError);
            imageUploadFailed = true;
          }
        }

        // Skip listing if image was required but upload failed
        // (Backend requires storage_path, so we can't create listing without image)
        if (localListing.imageUri && !storagePath) {
          console.warn(`Skipping listing ${localListing.id}: image file not readable or upload failed`);
          failed++;
          errors.push({
            listingId: localListing.id,
            error: {
              message: 'Image file not readable or upload failed',
              details: 'The image file may have been deleted or moved. Listing skipped.',
            },
          });
          continue;
        }

        // Convert price string to cents
        // Handle formats like "$100", "100", "100.50", etc.
        const priceStr = localListing.listing.price || '0';
        const priceNumber = parseFloat(priceStr.replace(/[^0-9.]/g, ''));
        const priceCents = Math.round(priceNumber * 100);

        // Determine currency code from currency symbol
        let currencyCode = 'USD';
        const currencySymbol = localListing.currency || '$';
        if (currencySymbol === '€' || currencySymbol === 'EUR') {
          currencyCode = 'EUR';
        } else if (currencySymbol === '£' || currencySymbol === 'GBP') {
          currencyCode = 'GBP';
        } else if (currencySymbol === '¥' || currencySymbol === 'JPY') {
          currencyCode = 'JPY';
        } else if (currencySymbol === 'CAD' || currencySymbol === '$') {
          currencyCode = currencySymbol === 'CAD' ? 'CAD' : 'USD';
        }

        // Create listing in backend
        // Note: storage_path is required by backend, so we only create if we have it
        const { listing, error: createError } = await createListing({
          title: localListing.listing.title || 'Untitled Listing',
          description: localListing.listing.description || '',
          price_cents: priceCents,
          currency: currencyCode,
          condition: localListing.listing.condition || undefined,
          category: undefined, // Local listings don't have category
          tags: [],
          storage_path: storagePath, // Required by backend
          visibility: 'private', // Migrated listings default to private
          ai_generated: true, // Assume migrated listings were AI-generated
        });

        if (createError) {
          // Handle quota exceeded - stop migration
          if (createError.code === 'QUOTA_EXCEEDED') {
            console.warn('Quota exceeded during migration. Stopping migration.');
            // Don't mark as complete, allow retry later
            return {
              migrated,
              failed: localListings.length - migrated,
              skipped: false,
              error: createError,
            };
          }
          throw createError;
        }

        migrated++;
      } catch (error: any) {
        console.error('Error migrating listing:', localListing.id, error);
        failed++;
        errors.push({ listingId: localListing.id, error });
        // Continue with next listing
      }
    }

    // If all listings migrated successfully (or at least attempted), clear local storage
    if (failed === 0 || migrated > 0) {
      await clearListings();
      await markMigrationCompleted(userId);
    }

    return {
      migrated,
      failed,
      skipped: false,
      error: errors.length > 0 ? errors : null,
    };
  } catch (error: any) {
    console.error('Migration error:', error);
    return { migrated: 0, failed: 0, skipped: false, error };
  } finally {
    // Always release migration lock
    migrationInProgress = false;
  }
}
