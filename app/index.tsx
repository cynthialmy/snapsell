import * as FileSystem from 'expo-file-system/legacy';
import * as ImagePicker from 'expo-image-picker';
import * as MediaLibrary from 'expo-media-library';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  AppState,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BlockedQuotaModal } from '@/components/BlockedQuotaModal';
import { LowSlotsWarning } from '@/components/LowSlotsWarning';
import { QuotaCounterPill } from '@/components/QuotaCounterPill';
import { SnappyLoading } from '@/components/snappy-loading';
import { useAuth } from '@/contexts/AuthContext';
import { trackError, trackEvent } from '@/utils/analytics';
import { analyzeItemPhoto, type ListingData } from '@/utils/api';
import { formatListingText } from '@/utils/listingFormatter';
import { saveListing } from '@/utils/listings';
import { checkAnonymousQuota, checkQuota, type AnonymousQuota, type UserQuota } from '@/utils/listings-api';
import { loadPreferences } from '@/utils/preferences';
import { clearStoredAnonymousQuota, getStoredAnonymousQuota, isNewDay, storeAnonymousQuota, updateLastQuotaCheckDate } from '@/utils/quota-storage';

// Check if an error message looks technical (contains URLs, version numbers, technical jargon, etc.)
function isTechnicalError(message: string): boolean {
  const lowerMessage = message.toLowerCase();

  // Check for URLs
  if (/https?:\/\//.test(message) || /\.(com|net|org|io|azure|ai)\//.test(lowerMessage)) {
    return true;
  }

  // Check for version numbers (dates like 2025-08-07, or version patterns)
  if (/\d{4}-\d{2}-\d{2}/.test(message) || /\bv\d+\.\d+/.test(lowerMessage)) {
    return true;
  }

  // Check for technical jargon (deployment, endpoint, api version, resource, etc.)
  const technicalTerms = [
    'deployment', 'endpoint', 'api version', 'resource', 'cognitiveservices',
    'verify that', 'please verify', 'exists in your', 'is correct', 'is supported'
  ];
  const technicalTermCount = technicalTerms.filter(term => lowerMessage.includes(term)).length;

  // If message contains multiple technical terms or is very long, it's likely technical
  if (technicalTermCount >= 2 || (technicalTermCount >= 1 && message.length > 100)) {
    return true;
  }

  return false;
}

// Transform technical error messages to cute Snappy messages
function transformErrorMessage(message: string): string {
  const lowerMessage = message.toLowerCase();

  // If it's already a cute message (contains "Snappy"), return as-is
  if (lowerMessage.includes('snappy')) {
    return message;
  }

  // Check if this looks like a technical error - if so, show generic message
  if (isTechnicalError(message)) {
    return "Snappy is having trouble processing your photo. Please try again.";
  }

  // Check for specific user-friendly error patterns and replace with cute messages
  if (lowerMessage.includes('timed out') || lowerMessage.includes('timeout')) {
    const cuteMessages = [
      "Snappy couldn't wake up because he partied too hard last night...",
      'Snappy is still snoozing. Give him a moment...',
      "Snappy is taking a longer nap than expected...",
      "Snappy is having a deep sleep. Let's try again...",
    ];
    return cuteMessages[Math.floor(Math.random() * cuteMessages.length)];
  }

  if (lowerMessage.includes('warming') || lowerMessage.includes('warmup')) {
    const cuteMessages = [
      'Snappy is napping. Waking him up...',
      'Snappy is stretching his paws...',
      'Snappy is brewing some coffee...',
    ];
    return cuteMessages[Math.floor(Math.random() * cuteMessages.length)];
  }

  if (lowerMessage.includes('network') || lowerMessage.includes('connection') || lowerMessage.includes('failed to connect')) {
    return "Snappy can't reach the server right now. Let's try again in a moment...";
  }

  // For other errors, return as-is (they might already be user-friendly)
  return message;
}

export default function HomeScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [quota, setQuota] = useState<UserQuota | null>(null);
  const [anonymousQuota, setAnonymousQuota] = useState<AnonymousQuota | null>(null);
  const [quotaLoading, setQuotaLoading] = useState(false);
  const [showBlockedModal, setShowBlockedModal] = useState(false);
  const [showLowQuotaNudge, setShowLowQuotaNudge] = useState(false);
  const [abortController, setAbortController] = useState<AbortController | null>(null);
  const previousQuotaRef = useRef<UserQuota | AnonymousQuota | null>(null);
  const quotaLoadingRef = useRef(false);
  const quotaUpdatedFromResponseRef = useRef<number>(0); // Timestamp of last quota update from API response

  const ctaLabel = useMemo(
    () => (isAnalyzing ? 'Creating listing…' : 'Create Listing'),
    [isAnalyzing],
  );

  const processImage = async (asset: ImagePicker.ImagePickerAsset) => {
    setIsAnalyzing(true);
    setErrorMessage(null);

    // Create abort controller for cancellation
    const controller = new AbortController();
    setAbortController(controller);

    try {
      // Check quota if user is authenticated
      if (user) {
        const { quota: currentQuota, error: quotaError } = await checkQuota();

        // Calculate total remaining creations (free + purchased)
        const totalRemaining = currentQuota?.creations?.total_remaining ??
          (currentQuota ? (currentQuota.creations_remaining_today + currentQuota.bonus_creations_remaining) : 0);

        console.log('[Image Analysis] Quota BEFORE analysis:', {
          creations_remaining: currentQuota?.creations_remaining_today,
          bonus_creations_remaining: currentQuota?.bonus_creations_remaining,
          total_remaining: totalRemaining,
          creations_daily_limit: currentQuota?.creations_daily_limit,
          save_slots_remaining: currentQuota?.save_slots_remaining,
          is_pro: currentQuota?.is_pro,
        });
        trackEvent('quota_checked', {
          has_quota: !!currentQuota,
          creations_remaining: currentQuota?.creations_remaining_today,
          total_remaining: totalRemaining,
          creations_daily_limit: currentQuota?.creations_daily_limit,
          save_slots_remaining: currentQuota?.save_slots_remaining,
          is_pro: currentQuota?.is_pro,
        });

        // Check if user can create (not Pro and no total creations remaining)
        if (!quotaError && currentQuota && !currentQuota.is_pro && totalRemaining === 0) {
          // Quota exceeded - show blocked modal
          trackEvent('generate_blocked_no_quota', {
            creations_remaining: currentQuota.creations_remaining_today,
            total_remaining: totalRemaining,
            creations_daily_limit: currentQuota.creations_daily_limit,
          });
          setIsAnalyzing(false);
          setShowBlockedModal(true);
          return;
        }
      } else {
        // Check quota for unauthenticated users
        if (anonymousQuota && anonymousQuota.creations_remaining_today === 0) {
          // Quota exceeded for anonymous user - show blocked modal
          trackEvent('generate_blocked_no_quota', {
            creations_remaining: anonymousQuota.creations_remaining_today,
            creations_daily_limit: anonymousQuota.creations_daily_limit,
            is_anonymous: true,
          });
          setIsAnalyzing(false);
          setShowBlockedModal(true);
          return;
        }
      }

      const preferences = await loadPreferences();
      const currency = preferences?.currency || '$';

      const { listing, quota: returnedQuota } = await analyzeItemPhoto({
        uri: asset.uri,
        filename: asset.fileName ?? 'snapsell-item.jpg',
        mimeType: asset.mimeType ?? 'image/jpeg',
        currency,
        onStatusChange: setErrorMessage,
        signal: controller.signal,
      });

      // Track successful listing generation
      const formattedText = formatListingText({ ...listing, currency });
      const truncatedText = formattedText.length > 1000
        ? formattedText.substring(0, 1000)
        : formattedText;

      trackEvent('listing_generated', {
        has_title: !!listing.title,
        has_price: !!listing.price,
        condition: listing.condition || '',
        generated_text: truncatedText,
      });

      // Upload image immediately so it's available when user saves
      // But don't create the listing until user explicitly saves
      let storagePath: string | undefined = undefined;
      if (user) {
        try {
          console.log('[Image Analysis] Uploading image for future save...');

          // Convert image to base64
          let base64Image: string | null = null;
          if (asset.uri.startsWith('data:')) {
            base64Image = asset.uri;
          } else {
            try {
              const fileInfo = await FileSystem.getInfoAsync(asset.uri);
              if (fileInfo.exists) {
                const base64 = await FileSystem.readAsStringAsync(asset.uri, {
                  encoding: 'base64',
                });
                const contentType = asset.mimeType || 'image/jpeg';
                base64Image = `data:${contentType};base64,${base64}`;
              }
            } catch (error) {
              console.warn('[Image Analysis] Could not convert image to base64:', error);
            }
          }

          if (base64Image) {
            const { uploadImage } = await import('@/utils/listings-api');
            const { data: uploadData, error: uploadError } = await uploadImage(base64Image, asset.mimeType || 'image/jpeg');
            if (!uploadError && uploadData?.storage_path) {
              storagePath = uploadData.storage_path;
              console.log('[Image Analysis] Image uploaded successfully, storage_path:', storagePath);
            } else {
              console.warn('[Image Analysis] Failed to upload image:', uploadError);
            }
          }
        } catch (error) {
          console.warn('[Image Analysis] Error uploading image:', error);
          // Continue anyway - will try again when saving
        }
      }

      // Don't auto-create listings - only create when user explicitly saves
      // This prevents "Untitled Listing" entries from being created
      navigateToPreview({ listing, imageUri: asset.uri, storagePath });

      // Use quota from response if available (for both authenticated and unauthenticated users)
      // Backend response structure:
      // - Authenticated: { creations_remaining_today, creations_daily_limit, bonus_creations_remaining,
      //                    save_slots_remaining, is_pro } (NO resets_at)
      // - Unauthenticated: Same as authenticated PLUS resets_at
      if (user) {
        // IMPORTANT: Only use returnedQuota if it exists and is valid
        // If returnedQuota is null/undefined, the backend didn't return updated quota
        // In that case, we should NOT call loadQuota() immediately as it might return stale data
        // Instead, we'll let useFocusEffect handle the refresh after a delay
        if (returnedQuota) {
          // Use quota from response - this is the updated quota after decrement
          console.log('[Image Analysis] Using quota from API response:', {
            creations_remaining: returnedQuota.creations_remaining_today,
            save_slots_remaining: returnedQuota.save_slots_remaining,
          });

          // Check if this is the first listing (quota went from 10 to 9)
          // Only show if user is not pro and had 10 remaining before
          const prevQuota = previousQuotaRef.current as UserQuota | null;
          const isFirstListing = !returnedQuota.is_pro &&
            prevQuota &&
            prevQuota.creations_remaining_today === 10 &&
            returnedQuota.creations_remaining_today === 9;

          // Update quota state immediately
          console.log('[Image Analysis] Updating quota after analysis:', {
            creations_remaining: returnedQuota.creations_remaining_today,
            save_slots_remaining: returnedQuota.save_slots_remaining,
            is_pro: returnedQuota.is_pro,
            fromResponse: true,
            isFirstListing,
            previousRemaining: prevQuota?.creations_remaining_today,
          });
          setQuota(returnedQuota);
          previousQuotaRef.current = returnedQuota;
          // Mark that quota was just updated from API response to prevent stale refresh
          quotaUpdatedFromResponseRef.current = Date.now();

          // Show first listing celebration message
          if (isFirstListing) {
            Alert.alert(
              '🎉 First Listing Created!',
              `Great job! You've created your first listing. You have 9 creations remaining for today. Every day you get 10 free creations.`,
              [{ text: 'Got it!', style: 'default' }]
            );
            trackEvent('first_listing_created', {
              creations_remaining: returnedQuota.creations_remaining_today,
            });
          }

          // Show low quota nudge if creations <= 2
          if (!returnedQuota.is_pro && returnedQuota.creations_remaining_today <= 2) {
            trackEvent('low_quota_nudge_shown', {
              type: 'creation',
              remaining: returnedQuota.creations_remaining_today,
            });
            setShowLowQuotaNudge(true);
          }
        } else {
          // No quota in response - don't refresh immediately to avoid stale data
          // The useFocusEffect will refresh it later when screen regains focus
          console.log('[Image Analysis] No quota in API response, will refresh on next screen focus');
        }
      } else if (returnedQuota) {
        // For unauthenticated users, extract anonymous quota from response
        // Backend response structure for unauthenticated users:
        // { creations_remaining_today, creations_daily_limit, bonus_creations_remaining (always 0),
        //   save_slots_remaining (always 0), is_pro (always false), resets_at }
        // Verify that returnedQuota has the required fields
        if (typeof returnedQuota.creations_remaining_today !== 'number' ||
            typeof returnedQuota.creations_daily_limit !== 'number') {
          console.warn('[Image Analysis] Invalid quota structure from backend:', {
            has_creations_remaining: 'creations_remaining_today' in returnedQuota,
            has_creations_daily_limit: 'creations_daily_limit' in returnedQuota,
            quota_keys: Object.keys(returnedQuota),
            quota: returnedQuota,
          });
          // Try to load quota separately if response structure is invalid
          await loadAnonymousQuota();
          return;
        }

        // Extract anonymous quota - resets_at should be present for unauthenticated users
        // but we provide a fallback just in case
        const anonymousQuotaData: AnonymousQuota = {
          creations_remaining_today: returnedQuota.creations_remaining_today,
          creations_daily_limit: returnedQuota.creations_daily_limit,
          creations_used_today: returnedQuota.creations_daily_limit - returnedQuota.creations_remaining_today,
          resets_at: returnedQuota.resets_at || new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        };

        // Check if this is the first listing (quota went from 10 to 9)
        const prevQuota = previousQuotaRef.current as AnonymousQuota | null;
        const isFirstListing = prevQuota &&
          prevQuota.creations_remaining_today === 10 &&
          anonymousQuotaData.creations_remaining_today === 9;

        console.log('[Image Analysis] Updating anonymous quota after analysis:', {
          ...anonymousQuotaData,
          isFirstListing,
          previousRemaining: prevQuota?.creations_remaining_today,
        });
        setAnonymousQuota(anonymousQuotaData);
        previousQuotaRef.current = anonymousQuotaData;
        // Store quota in AsyncStorage so other screens can access it
        await storeAnonymousQuota(anonymousQuotaData);
        // Mark that quota was just updated from API response (for anonymous users too)
        quotaUpdatedFromResponseRef.current = Date.now();

        // Show first listing celebration message
        if (isFirstListing) {
          Alert.alert(
            '🎉 First Listing Created!',
            `Great job! You've created your first listing. You have 9 creations remaining for today. Every day you get 10 free creations.`,
            [{ text: 'Got it!', style: 'default' }]
          );
          trackEvent('first_listing_created', {
            creations_remaining: anonymousQuotaData.creations_remaining_today,
          });
        }
      }
    } catch (error) {
      // Check if this is a cancellation (not an error)
      if (error instanceof Error && error.name === 'CancelledError') {
        console.log('[Image Analysis] Analysis cancelled by user');
        setErrorMessage(null);
        return;
      }

      const rawMessage = error instanceof Error ? error.message : 'Something went wrong. Please try again.';
      const errorCode = (error as any)?.code;
      const errorData = error as any;

      // Check if it's a quota exceeded error from the API (402)
      if (errorCode === 'QUOTA_EXCEEDED' || rawMessage.includes('QUOTA_EXCEEDED')) {
        trackEvent('generate_blocked_no_quota', {
          error_source: 'api',
        });
        setIsAnalyzing(false);
        setShowBlockedModal(true);
      }
      // Check if it's a rate limit error (429) - extract quota info
      else if (errorCode === 'RATE_LIMIT_EXCEEDED' || errorData?.remaining !== undefined) {
        const remaining = errorData.remaining ?? 0;
        const limit = errorData.limit ?? 10;
        const resetsAt = errorData.resets_at;

        // Update anonymous quota if available
        if (!user && remaining !== undefined && limit !== undefined) {
          const anonymousQuotaData: AnonymousQuota = {
            creations_remaining_today: remaining,
            creations_daily_limit: limit,
            creations_used_today: limit - remaining,
            resets_at: resetsAt || new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          };
          setAnonymousQuota(anonymousQuotaData);
        }

        // Show user-friendly rate limit message
        const rateLimitMessage = `Daily limit reached (${limit} creations). ${remaining > 0 ? `${remaining} remaining. ` : ''}${resetsAt ? `Resets at ${new Date(resetsAt).toLocaleTimeString()}` : 'Try again later.'}`;
        setErrorMessage(rateLimitMessage);
        trackEvent('rate_limit_hit', {
          remaining,
          limit,
          resets_at: resetsAt,
        });
      } else {
        const err = error instanceof Error ? error : new Error(String(error));
        trackError('image_analysis_error', err, { source: 'home' });
        setErrorMessage(transformErrorMessage(rawMessage));
      }
    } finally {
      // Ensure loading state is cleared immediately to allow navigation
      setIsAnalyzing(false);
      setAbortController(null);
    }
  };

  const handleCancelAnalysis = () => {
    if (abortController) {
      trackEvent('analysis_cancelled', { source: 'home' });
      abortController.abort();
      setAbortController(null);
      setIsAnalyzing(false);
      setErrorMessage(null);
    } else {
      // Defensive: ensure loading state is cleared even if abortController is null
      setIsAnalyzing(false);
      setErrorMessage(null);
    }
  };

  const savePhotoToLibrary = async (asset: ImagePicker.ImagePickerAsset) => {
    if (Platform.OS === 'web') {
      return;
    }

    try {
      const initialPermission = await MediaLibrary.getPermissionsAsync();
      let permissionStatus = initialPermission;

      if (!initialPermission.granted) {
        if (!initialPermission.canAskAgain) {
          setErrorMessage('Please allow SnapSell to save photos so Snappy can reuse them later.');
          return;
        }
        permissionStatus = await MediaLibrary.requestPermissionsAsync();
      }

      if (!permissionStatus.granted) {
        setErrorMessage('Please allow SnapSell to save photos so Snappy can reuse them later.');
        return;
      }

      await MediaLibrary.saveToLibraryAsync(asset.uri);
    } catch (error) {
      setErrorMessage('Snappy could not save that photo to your library, but the listing still works.');
    }
  };

  const handleTakePhoto = async () => {
    setErrorMessage(null);

    if (Platform.OS === 'web') {
      Alert.alert('Not available', 'Camera is not available on web. Please use "Choose from Library" instead.');
      return;
    }

    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();

      if (!permission.granted) {
        Alert.alert('Permission needed', 'Please allow SnapSell to access your camera.');
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: 'images',
        quality: 0.9,
        allowsEditing: false,
      });

      if (result.canceled) {
        return;
      }

      const asset = result.assets[0];
      await savePhotoToLibrary(asset);
      trackEvent('photo_uploaded', { source: 'camera' });
      await processImage(asset);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      if (errorMessage.includes('simulator') || errorMessage.includes('not available')) {
        Alert.alert(
          'Camera not available',
          'Camera is not available on simulator. Please use "Choose from Library" or test on a physical device.',
        );
      } else {
        setErrorMessage('Failed to open camera. Please try again or use "Choose from Library".');
      }
    }
  };

  const handleChooseFromLibrary = async () => {
    setErrorMessage(null);

    const permission =
      Platform.OS === 'web'
        ? { granted: true }
        : await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permission.granted) {
      Alert.alert('Permission needed', 'Please allow SnapSell to access your photos.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      allowsMultipleSelection: false,
      mediaTypes: 'images',
      quality: 0.9,
    });

    if (result.canceled) {
      return;
    }

    const asset = result.assets[0];
    trackEvent('photo_uploaded', { source: 'library' });
    await processImage(asset);
  };

  const handlePickImage = () => {
    if (Platform.OS === 'web') {
      // On web, only show library option
      handleChooseFromLibrary();
      return;
    }

    Alert.alert(
      'Select Photo',
      'Choose an option',
      [
        {
          text: 'Take Photo',
          onPress: handleTakePhoto,
        },
        {
          text: 'Choose from Library',
          onPress: handleChooseFromLibrary,
        },
        {
          text: 'Cancel',
          style: 'cancel',
        },
      ],
      { cancelable: true },
    );
  };

  const navigateToPreview = async (payload: { listing: ListingData; imageUri: string; listingId?: string; storagePath?: string; backendListingId?: string }) => {
    // Save listing to history if it doesn't have an ID (new listing)
    let listingId: string | undefined = payload.listingId;
    if (!listingId) {
      try {
        const preferences = await loadPreferences();
        const currency = preferences?.currency || '$';
        const savedId = await saveListing(payload.listing, currency, payload.imageUri);
        listingId = savedId || undefined;
      } catch (error) {
        // Don't block navigation if saving fails
        console.error('Failed to save listing:', error);
      }
    }

    const params = encodeURIComponent(JSON.stringify({
      ...payload,
      listingId,
    }));
    console.log('[Navigate] Payload being sent:', {
      hasStoragePath: !!payload.storagePath,
      storagePath: payload.storagePath,
      hasImageUri: !!payload.imageUri,
    });
    router.push({
      pathname: '/(tabs)/listing-preview',
      params: { payload: params },
    });
  };

  // Load quota for authenticated users
  const loadQuota = useCallback(async () => {
    if (!user) {
      setQuota(null);
      return null;
    }

    // Prevent concurrent quota checks
    if (quotaLoadingRef.current) {
      return null;
    }

    quotaLoadingRef.current = true;
    setQuotaLoading(true);
    try {
      // Check if it's a new day - if so, force refresh from backend
      const newDay = await isNewDay();

      if (newDay) {
        console.log('[Home] New day detected, forcing quota refresh');
        // Update the check date immediately to prevent multiple refreshes
        await updateLastQuotaCheckDate();
      }

      const { quota: userQuota, error } = await checkQuota();
      if (error) {
        // Silently handle backend not configured or unavailable
        // Only show quota if we successfully got it
        setQuota(null);
        return null;
      } else if (userQuota) {
        setQuota(userQuota);
        // Update last check date after successful quota fetch
        await updateLastQuotaCheckDate();

        // Store previous quota for first listing detection (only if not already set or same user)
        const prevUserQuota = previousQuotaRef.current as UserQuota | null;
        if (!previousQuotaRef.current || (prevUserQuota?.user_id === userQuota.user_id)) {
          previousQuotaRef.current = userQuota;
        }
        // Show low quota nudge if total creations <= 2
        const totalRemaining = userQuota.creations?.total_remaining ??
          (userQuota.creations_remaining_today + userQuota.bonus_creations_remaining);
        if (!userQuota.is_pro && totalRemaining <= 2) {
          trackEvent('low_quota_nudge_shown', {
            type: 'creation',
            remaining: totalRemaining,
          });
          setShowLowQuotaNudge(true);
        }
        return userQuota;
      }
      return null;
    } catch (error) {
      // Silently handle errors - backend might not be set up yet
      setQuota(null);
      return null;
    } finally {
      quotaLoadingRef.current = false;
      setQuotaLoading(false);
    }
  }, [user]);

  // Load anonymous quota for unauthenticated users
  const loadAnonymousQuota = useCallback(async (forceRefresh: boolean = false) => {
    if (user) {
      setAnonymousQuota(null);
      return null;
    }

    // Prevent concurrent quota checks
    if (quotaLoadingRef.current) {
      return null;
    }

    quotaLoadingRef.current = true;
    setQuotaLoading(true);
    try {
      // Check if it's a new day - if so, clear stored quota to force refresh
      const newDay = await isNewDay();

      if (newDay) {
        console.log('[Home] New day detected for anonymous user, clearing stored quota');
        // Clear stored anonymous quota so we get fresh quota
        await clearStoredAnonymousQuota();
        // Update the check date to prevent multiple refreshes
        await updateLastQuotaCheckDate();
      }

      // If force refresh or new day, always fetch from backend
      // Otherwise, try to load from AsyncStorage first (for performance)
      if (!forceRefresh && !newDay) {
        const storedQuota = await getStoredAnonymousQuota();
        if (storedQuota) {
          setAnonymousQuota(storedQuota);
          previousQuotaRef.current = storedQuota;
          // Update last check date after successful load
          await updateLastQuotaCheckDate();
          quotaLoadingRef.current = false;
          setQuotaLoading(false);
          return storedQuota;
        }
      }

      // Fetch from backend (on app start, new day, or when no stored quota)
      const { quota: anonymousQuotaData, error } = await checkAnonymousQuota();
      if (error) {
        // Silently handle backend not configured or unavailable
        // Fallback to stored quota if available
        if (!forceRefresh) {
          const storedQuota = await getStoredAnonymousQuota();
          if (storedQuota) {
            setAnonymousQuota(storedQuota);
            previousQuotaRef.current = storedQuota;
            quotaLoadingRef.current = false;
            setQuotaLoading(false);
            return storedQuota;
          }
        }
        setAnonymousQuota(null);
        return null;
      } else if (anonymousQuotaData) {
        setAnonymousQuota(anonymousQuotaData);
        // Store quota in AsyncStorage for future use
        await storeAnonymousQuota(anonymousQuotaData);
        // Update last check date after successful fetch
        await updateLastQuotaCheckDate();
        // Store previous quota for first listing detection
        previousQuotaRef.current = anonymousQuotaData;
        return anonymousQuotaData;
      }
      return null;
    } catch (error) {
      // Silently handle errors - backend might not be set up yet
      // Fallback to stored quota if available
      if (!forceRefresh) {
        try {
          const storedQuota = await getStoredAnonymousQuota();
          if (storedQuota) {
            setAnonymousQuota(storedQuota);
            previousQuotaRef.current = storedQuota;
            quotaLoadingRef.current = false;
            setQuotaLoading(false);
            return storedQuota;
          }
        } catch {
          // Ignore fallback errors
        }
      }
      setAnonymousQuota(null);
      return null;
    } finally {
      quotaLoadingRef.current = false;
      setQuotaLoading(false);
    }
  }, [user, anonymousQuota]);

  // Listen for app state changes to check for new day when app comes to foreground
  useEffect(() => {
    const subscription = AppState.addEventListener('change', async (nextAppState) => {
      if (nextAppState === 'active') {
        // App came to foreground - check if it's a new day
        const newDay = await isNewDay();
        if (newDay && user) {
          console.log('[Home] App came to foreground on new day, refreshing quota');
          // Update check date and refresh quota
          await updateLastQuotaCheckDate();
          loadQuota();
        } else if (newDay && !user) {
          // For anonymous users, new day detected - refresh quota
          console.log('[Home] App came to foreground on new day for anonymous user, refreshing quota');
          // Update check date and refresh quota (loadAnonymousQuota will clear stored quota)
          await updateLastQuotaCheckDate();
          loadAnonymousQuota();
        }
      }
    });

    return () => {
      subscription.remove();
    };
  }, [user, loadQuota, loadAnonymousQuota]);

  useFocusEffect(
    useCallback(() => {
      // trackScreenView('home', { is_authenticated: !!user }); // Disabled - overloading activities
      // Refresh quota from backend when screen comes into focus
      // But skip if quota was just updated from API response (within last 5 seconds)
      // This prevents overwriting correct quota with stale backend data
      // Note: Extended to 5 seconds for anonymous users since backend may return stale data
      const timeSinceLastUpdate = Date.now() - quotaUpdatedFromResponseRef.current;
      const shouldSkipRefresh = timeSinceLastUpdate < 5000; // 5 seconds

      if (shouldSkipRefresh) {
        console.log('[Home] Skipping quota refresh - quota was just updated from API response', {
          timeSinceLastUpdate,
          currentQuota: user ? quota?.creations_remaining_today : anonymousQuota?.creations_remaining_today,
        });
        return;
      }

      if (user) {
        loadQuota();
      } else {
        // On app start (first focus), always fetch from backend to get fresh quota
        // Use a ref to track if this is the first load
        const isFirstLoad = quotaUpdatedFromResponseRef.current === 0;
        loadAnonymousQuota(isFirstLoad);
      }
    }, [loadQuota, loadAnonymousQuota, user]), // Removed quota and anonymousQuota from deps to prevent infinite loop
  );

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <StatusBar barStyle="dark-content" />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Text style={styles.eyebrow}>SNAPSELL</Text>
          {/* Show quota for authenticated users */}
          {user && quota && !quota.is_pro && (
            <View style={styles.quotaHeader}>
              <QuotaCounterPill
                remaining={
                  quota.creations?.total_remaining ??
                  (quota.creations_remaining_today + quota.bonus_creations_remaining)
                }
                limit={
                  quota.creations?.total_remaining ??
                  (quota.creations_remaining_today + quota.bonus_creations_remaining)
                }
                label="Creations left"
              />
              <Text style={styles.quotaBreakdown}>
                Free left today: {quota.creations?.free_remaining_today ?? quota.creations_remaining_today} + Purchased: {quota.creations?.purchased_remaining ?? quota.bonus_creations_remaining}
              </Text>
            </View>
          )}
          {/* Show quota for unauthenticated users */}
          {!user && anonymousQuota && (
            <View style={styles.quotaHeader}>
              <QuotaCounterPill
                remaining={anonymousQuota.creations_remaining_today}
                limit={anonymousQuota.creations_daily_limit}
                label="Creations left today"
              />
              <Text style={styles.quotaBreakdown}>
                {anonymousQuota.creations_remaining_today} of {anonymousQuota.creations_daily_limit} free creations remaining
              </Text>
            </View>
          )}
        </View>
        <Text style={styles.title}>Turn a single photo into a ready-to-post listing.</Text>

        <View style={styles.steps}>
          <View style={styles.mascotCard}>
            <View style={styles.mascotAvatar}>
              <Text style={styles.mascotAvatarText}>🦦</Text>
            </View>
            <View style={styles.mascotBubble}>
              <Text style={styles.mascotIntro}>Snappy the Otter</Text>
              <Text style={styles.mascotText}>
                Give me a single photo and I will save it for you, narrate what I see, and hand back a
                listing you can paste anywhere.
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.ctaSection}>
          <Pressable
            accessibilityRole="button"
            onPress={handlePickImage}
            style={({ pressed }) => [
              styles.primaryButton,
              pressed && !isAnalyzing ? styles.primaryButtonPressed : null,
            ]}
            disabled={isAnalyzing}>
            <Text style={styles.primaryButtonIcon}>+</Text>
            <Text style={styles.primaryButtonText}>{ctaLabel}</Text>
          </Pressable>

          {errorMessage ? <Text style={styles.error}>{errorMessage}</Text> : null}
        </View>
      </ScrollView>
      <SnappyLoading visible={isAnalyzing} onCancel={isAnalyzing ? handleCancelAnalysis : undefined} />
      {(user || !user) && (
        <>
          <BlockedQuotaModal
            visible={showBlockedModal}
            type="creation"
            creationsRemaining={
              user && quota
                ? (quota.creations?.total_remaining ?? (quota.creations_remaining_today + quota.bonus_creations_remaining))
                : (anonymousQuota?.creations_remaining_today ?? 0)
            }
            creationsDailyLimit={
              user && quota
                ? (quota.creations?.daily_limit ?? quota.creations_daily_limit)
                : (anonymousQuota?.creations_daily_limit ?? 10)
            }
            onDismiss={() => setShowBlockedModal(false)}
            onPurchaseSuccess={() => {
              setShowBlockedModal(false);
              if (user) {
                loadQuota();
              } else {
                loadAnonymousQuota();
              }
            }}
          />
          {user && quota && (
            <LowSlotsWarning
              visible={showLowQuotaNudge}
              remaining={quota.creations?.total_remaining ?? (quota.creations_remaining_today + quota.bonus_creations_remaining)}
              type="creation"
              onDismiss={() => setShowLowQuotaNudge(false)}
              onUpgrade={() => {
                setShowLowQuotaNudge(false);
                router.push('/(tabs)/upgrade');
              }}
            />
          )}
        </>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F6F8FB',
  },
  content: {
    padding: 24,
    paddingBottom: 48,
    gap: 16,
    flexGrow: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  quotaHeader: {
    alignItems: 'flex-end',
    gap: 4,
  },
  quotaBreakdown: {
    fontSize: 10,
    color: '#64748B',
    textAlign: 'right',
  },
  eyebrow: {
    fontSize: 12,
    letterSpacing: 2,
    color: '#4F46E5',
    fontWeight: '600',
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#0F172A',
    lineHeight: 34,
  },
  subtitle: {
    fontSize: 16,
    color: '#334155',
    lineHeight: 22,
  },
  primaryButton: {
    backgroundColor: '#111827',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 999,
    minWidth: 200,
    gap: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  primaryButtonPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.98 }],
  },
  primaryButtonIcon: {
    fontSize: 24,
    fontWeight: '700',
    color: '#FFFFFF',
    lineHeight: 28,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  error: {
    color: '#D97706',
    fontSize: 15,
    fontFamily: Platform.select({
      ios: 'MarkerFelt-Wide',
      android: 'casual',
      default: 'Comic Sans MS',
    }),
    lineHeight: 20,
  },
  steps: {
    marginTop: 8,
    gap: 12,
  },
  mascotCard: {
    flexDirection: 'row',
    gap: 12,
    backgroundColor: '#E0F2FE',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#BAE6FD',
  },
  mascotAvatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#0EA5E9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mascotAvatarText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 32,
  },
  mascotBubble: {
    flex: 1,
    gap: 4,
  },
  mascotIntro: {
    fontSize: 12,
    color: '#0369A1',
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  mascotText: {
    fontSize: 14,
    color: '#0F172A',
    lineHeight: 20,
  },
  ctaSection: {
    gap: 12,
    marginTop: 48,
  },
  quotaCard: {
    backgroundColor: '#EFF6FF',
    borderRadius: 14,
    padding: 16,
    marginTop: 16,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  quotaText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#0F172A',
    marginBottom: 4,
  },
  quotaSubtext: {
    fontSize: 14,
    color: '#64748B',
  },
  upgradeButton: {
    backgroundColor: '#4338CA',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    marginTop: 12,
    alignItems: 'center',
  },
  upgradeButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
});
