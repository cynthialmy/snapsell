import * as Clipboard from 'expo-clipboard';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import * as MediaLibrary from 'expo-media-library';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  InteractionManager,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BlockedQuotaModal } from '@/components/BlockedQuotaModal';
import { LoginGateModal } from '@/components/LoginGateModal';
import { LowSlotsWarning } from '@/components/LowSlotsWarning';
import { QuotaModal } from '@/components/QuotaModal';
import { SaveSlotsPaywall } from '@/components/SaveSlotsPaywall';
import { SnappyLoading } from '@/components/snappy-loading';
import { useAuth } from '@/contexts/AuthContext';
import { trackError, trackEvent } from '@/utils/analytics';
import { analyzeItemPhoto, type ListingData } from '@/utils/api';
import { formatListingText } from '@/utils/listingFormatter';
import { saveListing, updateListing } from '@/utils/listings';
import { checkQuota, createListing, getListingById, updateListing as updateListingApi, uploadImage, type UserQuota } from '@/utils/listings-api';
import { loadPreferences, savePreferences, type UserPreferences } from '@/utils/preferences';
import { checkQuotaModalShouldShow, getQuotaPeriod, markQuotaModalDismissed } from '@/utils/quota';
import * as FileSystem from 'expo-file-system/legacy';

type PreviewPayload = {
  listing: ListingData;
  imageUri: string;
  listingId?: string;
  storagePath?: string; // Storage path if image was already uploaded
  backendListingId?: string; // Backend listing ID if already created in Supabase
};

const CONDITION_OPTIONS = ['New', 'Used - Like New', 'Used - Good', 'Used - Fair', 'Refurbished'];

const CURRENCY_OPTIONS = ['$', '€', '£', 'kr', '¥'];

type FieldModification = {
  field: string;
  oldValue: any;
  newValue: any;
  timestamp: number;
};

export default function ListingPreviewScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ payload?: string; listingId?: string }>();
  const { user } = useAuth();
  const [backendListingId, setBackendListingId] = useState<string | null>(null);
  const [loadingFromBackend, setLoadingFromBackend] = useState(false);
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [storagePath, setStoragePath] = useState<string | null>(null);

  // Login gate state
  const [showLoginGate, setShowLoginGate] = useState(false);

  // Quota modal state
  const [showQuotaModal, setShowQuotaModal] = useState(false);
  const [quotaCount, setQuotaCount] = useState(0);

  // Save Slots state
  const [quota, setQuota] = useState<UserQuota | null>(null);
  const [quotaLoading, setQuotaLoading] = useState(false);
  const [showPaywall, setShowPaywall] = useState(false);
  const [showLowSlotsWarning, setShowLowSlotsWarning] = useState(false);
  const [showSaveSuccessToast, setShowSaveSuccessToast] = useState(false);
  const [showBlockedSaveModal, setShowBlockedSaveModal] = useState(false);

  // Image processing state
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showBlockedModal, setShowBlockedModal] = useState(false);
  const [showLowQuotaNudge, setShowLowQuotaNudge] = useState(false);
  const [abortController, setAbortController] = useState<AbortController | null>(null);

  // Auto-save checkbox state
  const [autoSaveListing, setAutoSaveListing] = useState(false);

  const payload = useMemo<PreviewPayload | null>(() => {
    if (!params.payload) return null;
    try {
      const parsed = JSON.parse(decodeURIComponent(params.payload));
      console.log('[Listing Preview] Parsed payload:', {
        hasStoragePath: !!parsed.storagePath,
        storagePath: parsed.storagePath,
        hasImageUri: !!parsed.imageUri,
      });
      return parsed;
    } catch {
      return null;
    }
  }, [params.payload]);

  // Set imageUri from payload when it's available
  useEffect(() => {
    if (payload?.imageUri && !imageUri) {
      setImageUri(payload.imageUri);
    }
  }, [payload?.imageUri]);

  const listing = payload?.listing;

  const resolvedInitialCondition = (() => {
    const candidate = listing?.condition;
    if (candidate && CONDITION_OPTIONS.includes(candidate)) {
      return candidate;
    }
    return CONDITION_OPTIONS[2];
  })();

  const [title, setTitle] = useState(listing?.title ?? '');
  const [price, setPrice] = useState(listing?.price ?? '');
  const [description, setDescription] = useState(listing?.description ?? '');
  const [condition, setCondition] = useState(resolvedInitialCondition);
  const [location, setLocation] = useState(listing?.location ?? '');
  const [pickupAvailable, setPickupAvailable] = useState(listing?.pickupAvailable ?? false);
  const [shippingAvailable, setShippingAvailable] = useState(listing?.shippingAvailable ?? false);
  const [pickupNotes, setPickupNotes] = useState(listing?.pickupNotes ?? '');
  const [copySuccess, setCopySuccess] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const [showConditionModal, setShowConditionModal] = useState(false);
  const [showCurrencyDropdown, setShowCurrencyDropdown] = useState(false);
  const [currency, setCurrency] = useState<string>('$');

  // Tracking state
  const [initialValues, setInitialValues] = useState<Record<string, any> | null>(null);
  const [modifications, setModifications] = useState<FieldModification[]>([]);
  const [listingId, setListingId] = useState<string | undefined>(payload?.listingId);

  // Refs for auto-save tracking (declared early so they can be used in useEffects)
  const hasAutoSavedRef = useRef(false);
  const isSavingRef = useRef(false);
  const autoSaveTimerRef = useRef<number | null>(null);

  // Refs to track previous values for onBlur tracking
  const prevTitleRef = useRef<string>(listing?.title ?? '');
  const prevPriceRef = useRef<string>(listing?.price ?? '');
  const prevLocationRef = useRef<string>(listing?.location ?? '');
  const prevDescriptionRef = useRef<string>(listing?.description ?? '');
  const prevPickupNotesRef = useRef<string>(listing?.pickupNotes ?? '');
  const prevCurrencyRef = useRef<string>('$');
  const prevConditionRef = useRef<string>(resolvedInitialCondition);
  const prevPickupAvailableRef = useRef<boolean>(listing?.pickupAvailable ?? false);
  const prevShippingAvailableRef = useRef<boolean>(listing?.shippingAvailable ?? false);

  const previewText = useMemo(
    () =>
      formatListingText({
        title,
        price,
        description,
        condition,
        location,
        pickupAvailable,
        shippingAvailable,
        pickupNotes,
        currency,
      }),
    [title, price, description, condition, location, pickupAvailable, shippingAvailable, pickupNotes, currency],
  );

  // Track screen view
  useFocusEffect(
    useCallback(() => {
      // trackScreenView('listing-preview', { // Disabled - overloading activities
      //   has_backend_id: !!backendListingId,
      //   has_payload: !!payload,
      //   has_listing_id: !!params.listingId,
      // });

      // Refresh quota when screen comes into focus (e.g., after returning from save)
      if (user) {
        checkQuota().then(({ quota: userQuota }) => {
          if (userQuota) {
            setQuota(userQuota);
          }
        }).catch((error) => {
          console.warn('[Listing Preview] Failed to refresh quota on focus:', error);
        });
      }
    }, [backendListingId, payload, params.listingId, user])
  );

  // Track field-level edits
  useEffect(() => {
    if (title !== prevTitleRef.current && prevTitleRef.current !== '') {
      trackEvent('listing_field_edited', {
        field_name: 'title',
        has_backend_id: !!backendListingId,
      });
    }
  }, [title, backendListingId]);

  useEffect(() => {
    if (price !== prevPriceRef.current && prevPriceRef.current !== '') {
      trackEvent('listing_field_edited', {
        field_name: 'price',
        has_backend_id: !!backendListingId,
      });
    }
  }, [price, backendListingId]);

  useEffect(() => {
    if (description !== prevDescriptionRef.current && prevDescriptionRef.current !== '') {
      trackEvent('listing_field_edited', {
        field_name: 'description',
        has_backend_id: !!backendListingId,
      });
    }
  }, [description, backendListingId]);

  useEffect(() => {
    if (condition !== prevConditionRef.current && prevConditionRef.current !== '') {
      trackEvent('listing_field_edited', {
        field_name: 'condition',
        has_backend_id: !!backendListingId,
      });
    }
  }, [condition, backendListingId]);

  useEffect(() => {
    if (location !== prevLocationRef.current && prevLocationRef.current !== '') {
      trackEvent('listing_field_edited', {
        field_name: 'location',
        has_backend_id: !!backendListingId,
      });
    }
  }, [location, backendListingId]);

  useEffect(() => {
    if (currency !== prevCurrencyRef.current && prevCurrencyRef.current !== '') {
      trackEvent('listing_field_edited', {
        field_name: 'currency',
        has_backend_id: !!backendListingId,
      });
    }
  }, [currency, backendListingId]);

  useEffect(() => {
    if (pickupAvailable !== prevPickupAvailableRef.current && prevPickupAvailableRef.current !== false) {
      trackEvent('listing_field_edited', {
        field_name: 'pickup_available',
        has_backend_id: !!backendListingId,
      });
    }
  }, [pickupAvailable, backendListingId]);

  useEffect(() => {
    if (shippingAvailable !== prevShippingAvailableRef.current && prevShippingAvailableRef.current !== false) {
      trackEvent('listing_field_edited', {
        field_name: 'shipping_available',
        has_backend_id: !!backendListingId,
      });
    }
  }, [shippingAvailable, backendListingId]);

  useEffect(() => {
    if (pickupNotes !== prevPickupNotesRef.current && prevPickupNotesRef.current !== '') {
      trackEvent('listing_field_edited', {
        field_name: 'pickup_notes',
        has_backend_id: !!backendListingId,
      });
    }
  }, [pickupNotes, backendListingId]);

  // Load listing from backend if listingId is provided but no payload
  useEffect(() => {
    const loadListingFromBackend = async () => {
      // If we have a payload, don't load from backend
      if (payload) {
        return;
      }

      // If we have a listingId param, load from backend
      if (params.listingId && user) {
        setLoadingFromBackend(true);
        try {
          const { listing: backendListing, error } = await getListingById(params.listingId);
          if (error || !backendListing) {
            Alert.alert('Error', 'Failed to load listing. Please try again.', [
              { text: 'OK', onPress: () => router.back() },
            ]);
            return;
          }

          // Convert backend listing format to ListingData format
          const listingData: ListingData = {
            title: backendListing.title || '',
            price: backendListing.price_cents ? (backendListing.price_cents / 100).toString() : '',
            description: backendListing.description || '',
            condition: backendListing.condition || undefined,
            location: '', // Backend doesn't store location separately
            pickupAvailable: false, // Backend doesn't store these separately
            shippingAvailable: false,
            pickupNotes: '',
          };

          // Set the backend listing ID
          setBackendListingId(backendListing.id);

          // Set image URI from backend
          if (backendListing.image_url) {
            setImageUri(backendListing.image_url);
          }

          // Update form fields with loaded data
          setTitle(listingData.title);
          setPrice(listingData.price);
          setDescription(listingData.description);
          if (listingData.condition && CONDITION_OPTIONS.includes(listingData.condition)) {
            setCondition(listingData.condition);
          }

          // Convert currency code to symbol
          const currencyMap: Record<string, string> = {
            USD: '$',
            EUR: '€',
            GBP: '£',
            JPY: '¥',
            CAD: '$',
          };
          const currencySymbol = currencyMap[backendListing.currency] || '$';
          setCurrency(currencySymbol);

          // Load preferences to get default values for fields not stored in backend
          const prefs = await loadPreferences();
          const finalCurrency = currencySymbol;
          const finalLocation = prefs?.location || '';
          const finalCondition = listingData.condition || CONDITION_OPTIONS[2];
          const finalPickupAvailable = prefs?.pickupAvailable ?? false;
          const finalShippingAvailable = prefs?.shippingAvailable ?? false;
          const finalPickupNotes = prefs?.pickupNotes || '';

          // Set initial values immediately so auto-save can detect changes
          const initial = {
            title: listingData.title,
            price: listingData.price,
            currency: finalCurrency,
            condition: finalCondition,
            location: finalLocation,
            description: listingData.description,
            pickupAvailable: finalPickupAvailable,
            shippingAvailable: finalShippingAvailable,
            pickupNotes: finalPickupNotes,
          };
          setInitialValues(initial);

          // Reset modifications
          setModifications([]);
        } catch (error) {
          console.error('Error loading listing from backend:', error);
          Alert.alert('Error', 'Failed to load listing. Please try again.', [
            { text: 'OK', onPress: () => router.back() },
          ]);
        } finally {
          setLoadingFromBackend(false);
        }
      } else if (!payload && !params.listingId) {
        // No payload and no listingId - show error
        Alert.alert('Upload required', 'Please add an item before opening the preview.', [
          { text: 'OK', onPress: () => router.push('/(tabs)/my-listings') },
        ]);
      }
    };

    loadListingFromBackend();
  }, [params.listingId, payload, user, router]);

  useEffect(() => {
    if (payload) {
      // Update listingId when payload changes
      setListingId(payload.listingId);
      // Update backendListingId when payload changes
      // IMPORTANT: Reset to null if payload doesn't have backendListingId (new listing)
      if (payload.backendListingId) {
        setBackendListingId(payload.backendListingId);
      } else {
        // Reset backendListingId for new listings (no backendListingId in payload)
        setBackendListingId(null);
      }
      // Update image URI from payload
      if (payload.imageUri) {
        setImageUri(payload.imageUri);
      }
      // Update storage path from payload
      if (payload.storagePath) {
        console.log('[Listing Preview] Setting storagePath from payload:', payload.storagePath);
        setStoragePath(payload.storagePath);
      } else {
        console.log('[Listing Preview] No storagePath in payload');
      }
      // Reset modifications when payload changes (new listing loaded)
      setModifications([]);
      // Reset initial values so they get recalculated for the new listing
      setInitialValues(null);
      // Reset auto-save ref and checkbox state when new listing is loaded (don't auto-save new listings unless user checks box)
      hasAutoSavedRef.current = false;
      setAutoSaveListing(false);
    }
  }, [payload]);

  // Update form fields when listing changes (new image analyzed)
  // This resets title, price, description, condition from the new listing
  // but keeps location, pickup, shipping, currency from preferences
  useEffect(() => {
    if (listing) {
      // Reset these fields from the new listing data
      setTitle(listing.title ?? '');
      setPrice(listing.price ?? '');
      setDescription(listing.description ?? '');

      // Reset condition from new listing, or default to "Used - Good"
      const newCondition = (listing.condition && CONDITION_OPTIONS.includes(listing.condition))
        ? listing.condition
        : CONDITION_OPTIONS[2];
      setCondition(newCondition);

      // Update refs to match new values
      prevTitleRef.current = listing.title ?? '';
      prevPriceRef.current = listing.price ?? '';
      prevDescriptionRef.current = listing.description ?? '';
      prevConditionRef.current = newCondition;
    }
  }, [listing]);

  // Load quota on mount and when user changes
  useEffect(() => {
    const loadQuotaData = async () => {
      if (!user) {
        setQuota(null);
        setQuotaLoading(false);
        return;
      }

      setQuotaLoading(true);
      try {
        const { quota: userQuota, error } = await checkQuota();
        if (error) {
          // Silently handle errors (backend might not be configured)
          setQuota(null);
        } else {
          setQuota(userQuota);
        }
      } catch (error) {
        console.warn('[Listing Preview] Failed to load quota:', error);
        setQuota(null);
      } finally {
        setQuotaLoading(false);
      }
    };

    loadQuotaData();
  }, [user]);

  // Load saved preferences on mount and when listing changes
  // This ensures preferences (location, pickup, shipping, currency) persist across new listings
  // IMPORTANT: We do NOT load autoSaveListing preference when listing changes - each new listing starts with unchecked checkbox
  useEffect(() => {
    const loadSavedPreferences = async () => {
      const prefs = await loadPreferences();
      if (prefs) {
        // Only apply location preference if listing doesn't have one
        const currentLocation = listing?.location ?? '';
        if (!currentLocation && prefs.location) {
          setLocation(prefs.location);
        }
        // Always load pickup/shipping preferences from saved preferences
        if (prefs.pickupAvailable !== undefined) {
          setPickupAvailable(prefs.pickupAvailable);
        }
        if (prefs.shippingAvailable !== undefined) {
          setShippingAvailable(prefs.shippingAvailable);
        }
        if (prefs.pickupNotes) {
          setPickupNotes(prefs.pickupNotes);
        }
        if (prefs.currency) {
          setCurrency(prefs.currency);
        }
        // DO NOT load auto-save preference when listing changes
        // Each new listing should start with checkbox unchecked
        // The preference is only used to remember user's choice, but doesn't auto-check for new listings
      }

      // Initialize tracking with initial values after preferences are loaded
      // This captures the state after preferences have been applied
      // Recalculate if initialValues is null (first load or after reset)
      if (!initialValues) {
        const finalCurrency = prefs?.currency || '$';
        const finalLocation = listing?.location || prefs?.location || '';
        const finalCondition = (() => {
          const candidate = listing?.condition;
          if (candidate && CONDITION_OPTIONS.includes(candidate)) {
            return candidate;
          }
          return CONDITION_OPTIONS[2];
        })();
        const finalPickupAvailable = prefs?.pickupAvailable ?? listing?.pickupAvailable ?? false;
        const finalShippingAvailable = prefs?.shippingAvailable ?? listing?.shippingAvailable ?? false;
        const finalPickupNotes = prefs?.pickupNotes || listing?.pickupNotes || '';

        const initial = {
          title: listing?.title ?? '',
          price: listing?.price ?? '',
          currency: finalCurrency,
          condition: finalCondition,
          location: finalLocation,
          description: listing?.description ?? '',
          pickupAvailable: finalPickupAvailable,
          shippingAvailable: finalShippingAvailable,
          pickupNotes: finalPickupNotes,
        };
        setInitialValues(initial);

        // Update refs to match the final initial state
        prevTitleRef.current = listing?.title ?? '';
        prevPriceRef.current = listing?.price ?? '';
        prevDescriptionRef.current = listing?.description ?? '';
        prevCurrencyRef.current = finalCurrency;
        prevConditionRef.current = finalCondition;
        prevLocationRef.current = finalLocation;
        prevPickupAvailableRef.current = finalPickupAvailable;
        prevShippingAvailableRef.current = finalShippingAvailable;
        prevPickupNotesRef.current = finalPickupNotes;

        console.log('[Tracking] Initial values set:', initial);
      }
    };
    loadSavedPreferences();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listing]);

  // Save preferences when they change
  useEffect(() => {
    const savePrefs = async () => {
      const prefs: UserPreferences = {
        location,
        pickupAvailable,
        shippingAvailable,
        pickupNotes,
        currency,
        autoSaveListing,
      };
      await savePreferences(prefs);
    };
    // Debounce saves to avoid too many writes
    const timer = setTimeout(savePrefs, 500);
    return () => clearTimeout(timer);
  }, [location, pickupAvailable, shippingAvailable, pickupNotes, currency, autoSaveListing]);

  // When user logs in after trying to check the box, check it automatically
  useEffect(() => {
    if (user && showLoginGate) {
      // User just logged in, check the box and close login gate
      setAutoSaveListing(true);
      setShowLoginGate(false);
    }
  }, [user, showLoginGate]);

  // Helper function to normalize values for comparison (defined early so it can be used in useEffects)
  const normalizeValue = (value: any): any => {
    if (typeof value === 'string') {
      return value.trim();
    }
    return value;
  };

  // Auto-save listing when checkbox is checked and user is authenticated
  // Use a ref to track if we've already saved for this checkbox state
  // Note: The actual save is triggered from handleAutoSaveToggle to avoid timing issues
  // IMPORTANT: We do NOT auto-save when preference is loaded from storage - only when user explicitly checks the box
  // This prevents listings from being saved automatically when user didn't intend to save them
  useEffect(() => {
    // Only reset when unchecked - do NOT trigger auto-save here
    // Auto-save is ONLY triggered from handleAutoSaveToggle when user explicitly checks the box
    if (!autoSaveListing) {
      // Reset when unchecked
      hasAutoSavedRef.current = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoSaveListing, user]);

  // Auto-save changes for existing listings (those with backendListingId)
  // Debounce saves to avoid too many API calls while user is typing
  useEffect(() => {
    // Only auto-save if:
    // 1. We have a backendListingId (editing existing listing)
    // 2. User is authenticated
    // 3. Initial values are set (so we can detect changes)
    // 4. We're not currently saving
    if (!backendListingId || !user || !initialValues || isSavingRef.current) {
      return;
    }

    // Check if any field has changed from initial values
    const titleChanged = normalizeValue(title) !== normalizeValue(initialValues.title);
    const priceChanged = normalizeValue(price) !== normalizeValue(initialValues.price);
    const descriptionChanged = normalizeValue(description) !== normalizeValue(initialValues.description);
    const conditionChanged = normalizeValue(condition) !== normalizeValue(initialValues.condition);
    const currencyChanged = normalizeValue(currency) !== normalizeValue(initialValues.currency);
    const pickupChanged = pickupAvailable !== initialValues.pickupAvailable;
    const shippingChanged = shippingAvailable !== initialValues.shippingAvailable;
    const pickupNotesChanged = normalizeValue(pickupNotes) !== normalizeValue(initialValues.pickupNotes);

    const hasChanges = titleChanged || priceChanged || descriptionChanged || conditionChanged ||
                       currencyChanged || pickupChanged || shippingChanged || pickupNotesChanged;

    if (!hasChanges) {
      return;
    }

    // Clear existing timer
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
    }

    // Debounce: wait 1.5 seconds after user stops typing before saving
    autoSaveTimerRef.current = setTimeout(() => {
      performSave();
    }, 1500);

    // Cleanup timer on unmount or when dependencies change
    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
      }
    };
  }, [title, price, description, condition, currency, pickupAvailable, shippingAvailable, pickupNotes, backendListingId, user, initialValues]);


  // Show loading state while loading from backend
  if (loadingFromBackend) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Loading listing...</Text>
        </View>
      </SafeAreaView>
    );
  }

  // If no payload and no listingId, show nothing (error already shown)
  if (!payload && !params.listingId) {
    return null;
  }

  // Helper function to track field modifications
  const trackFieldModification = (field: string, oldValue: any, newValue: any) => {
    if (!initialValues) {
      return;
    }

    const normalizedOld = normalizeValue(oldValue);
    const normalizedNew = normalizeValue(newValue);
    const initialValue = normalizeValue(initialValues[field]);

    // Don't track if values are the same
    if (normalizedOld === normalizedNew) {
      return;
    }

    // Don't track if both old and new values are empty/undefined
    if (!initialValue && !normalizedOld && !normalizedNew) {
      return;
    }

    // Only track if the new value is different from the initial value
    // or if the old value was the initial value and new value is different
    const isChangedFromInitial = normalizedNew !== initialValue;
    const wasInitialValue = normalizedOld === initialValue;

    if (isChangedFromInitial || (wasInitialValue && normalizedNew !== normalizedOld)) {
      // Check if we already have a modification for this field
      setModifications(prev => {
        const existingIndex = prev.findIndex(m => m.field === field);
        const newModification: FieldModification = {
          field,
          oldValue: wasInitialValue ? initialValue : normalizedOld,
          newValue: normalizedNew,
          timestamp: Date.now(),
        };

        console.log(`[Tracking] Field modified: ${field}`, {
          oldValue: String(newModification.oldValue ?? ''),
          newValue: String(newModification.newValue ?? ''),
          initialValue: String(initialValue ?? ''),
        });

        if (existingIndex >= 0) {
          // Update existing modification
          const updated = [...prev];
          updated[existingIndex] = newModification;
          return updated;
        } else {
          // Add new modification
          return [...prev, newModification];
        }
      });
    }
  };

  const handleCopy = async () => {
    await Clipboard.setStringAsync(previewText);

    // Ensure description modifications are tracked (onBlur may not fire reliably for multiline)
    // Check all fields for untracked modifications before building analytics
    const untrackedModifications: FieldModification[] = [];
    if (initialValues) {
      const normalizedDescription = normalizeValue(description);
      const normalizedInitialDescription = normalizeValue(initialValues.description);
      if (normalizedDescription !== normalizedInitialDescription) {
        // Check if description modification is already tracked
        const descriptionModExists = modifications.some(m => m.field === 'description');
        if (!descriptionModExists) {
          // Track it now and add to untracked list
          trackFieldModification('description', normalizedInitialDescription, normalizedDescription);
          untrackedModifications.push({
            field: 'description',
            oldValue: normalizedInitialDescription,
            newValue: normalizedDescription,
            timestamp: Date.now(),
          });
        }
      }
    }

    // Combine existing modifications with any newly tracked ones
    const allModifications = [...modifications, ...untrackedModifications];

    // Prepare modification summary for analytics
    const modifiedFields = allModifications.map(m => m.field);
    const totalModifications = allModifications.length;

    // Flatten modifications for PostHog - convert to JSON string for nested data
    // PostHog handles arrays of objects better as JSON strings
    const modificationsJson = JSON.stringify(
      allModifications.map(m => ({
        field: m.field,
        oldValue: String(m.oldValue ?? ''),
        newValue: String(m.newValue ?? ''),
      }))
    );

    // Build properties object
    const properties: Record<string, any> = {
      source: 'preview',
      total_modifications: totalModifications,
    };

    // Add modified fields as comma-separated string (PostHog-friendly)
    if (modifiedFields.length > 0) {
      properties.modified_fields = modifiedFields.join(',');
      properties.modifications_json = modificationsJson;
    }

    // Debug logging
    console.log('[Analytics] Tracking listing_copied:', {
      totalModifications,
      modifiedFields,
      modificationsCount: allModifications.length,
      properties,
    });

    trackEvent('listing_copied', properties);

    setCopySuccess(true);
  };

  // Handle checkbox toggle - checks auth and shows login gate if needed
  const handleAutoSaveToggle = async (value: boolean) => {
    console.log('[AutoSave] Toggle attempt:', { value, user: !!user });

    if (!user && value) {
      // User wants to check the box but is not authenticated
      console.log('[AutoSave] Showing login gate');
      setShowLoginGate(true);
      trackEvent('auto_save_toggle_attempt', { authenticated: false });
      return; // Don't update checkbox state
    }

    // Check if save slots are available
    if (value && user && quota && !quota.is_pro && quota.save_slots_remaining === 0) {
      // No save slots available - show blocked modal
      trackEvent('save_blocked_no_quota', {
        save_slots_remaining: quota.save_slots_remaining,
      });
      setShowBlockedSaveModal(true);
      return; // Don't update checkbox state
    }

    // User is authenticated or unchecking, update preference
    console.log('[AutoSave] Updating preference:', value);
    setAutoSaveListing(value);
    trackEvent('auto_save_toggle', { enabled: value, authenticated: !!user });

    // If checking and authenticated, save immediately
    // Set the ref first to prevent useEffect from also triggering a save
    if (value && user) {
      hasAutoSavedRef.current = true;
      performSave();
    } else if (!value) {
      // Reset when unchecked
      hasAutoSavedRef.current = false;
    }
  };

  // Perform the actual save operation
  const performSave = async () => {
    // Prevent concurrent save operations
    if (isSavingRef.current) {
      console.log('[Listing Save] Save already in progress, skipping duplicate call');
      return;
    }

    console.log('[Listing Save] performSave called', {
      hasUser: !!user,
      hasBackendListingId: !!backendListingId,
      hasListingId: !!listingId,
      hasStoragePath: !!storagePath,
      hasPayloadStoragePath: !!payload?.storagePath,
    });

    if (!user) {
      // Should not happen, but handle gracefully
      console.warn('[Listing Save] No user, cannot save');
      return;
    }

    // Mark as saving
    isSavingRef.current = true;

    // Build current listing data
    const currentListing: ListingData = {
      title,
      price,
      description,
      condition,
      location,
      pickupAvailable,
      shippingAvailable,
      pickupNotes,
    };

    let savedListingId: string | null = null;

    try {
      // Save or update listing
      // Priority: If backendListingId exists, update backend listing (this handles listings loaded from my-listings)
      console.log('[Listing Save] Checking conditions:', {
        backendListingId,
        listingId,
        backendListingIdType: typeof backendListingId,
        backendListingIdTruthy: !!backendListingId,
      });

      if (backendListingId) {
        // Update existing backend listing with all modifications
        console.log('[Listing Save] Updating existing backend listing:', backendListingId);
        const priceCents = Math.round(parseFloat(price || '0') * 100);
        let currencyCode = 'USD';
        if (currency === '€') {
          currencyCode = 'EUR';
        } else if (currency === '£') {
          currencyCode = 'GBP';
        } else if (currency === '¥') {
          currencyCode = 'JPY';
        } else if (currency === 'kr') {
          currencyCode = 'NOK';
        }

        const { listing: updatedListing, error: updateError } = await updateListingApi(backendListingId, {
          title,
          description,
          price_cents: priceCents,
          currency: currencyCode,
          condition,
        });

        if (updateError) {
          console.error('[Listing Save] Failed to update backend listing:', updateError);
          Alert.alert(
            'Update Failed',
            `Could not update listing: ${updateError.message || 'Unknown error'}.`,
            [{ text: 'OK' }]
          );
        } else {
          console.log('[Listing Save] Successfully updated backend listing');
          trackEvent('listing_saved', { listing_id: backendListingId, user_id: user.id });

          // Update initial values to reflect the saved state, so we don't trigger another save immediately
          if (initialValues) {
            setInitialValues({
              ...initialValues,
              title,
              price,
              description,
              condition,
              currency,
              pickupAvailable,
              shippingAvailable,
              pickupNotes,
            });
          }
        }

        // Also update local storage if listingId exists
        if (listingId) {
          await updateListing(listingId, currentListing, currency);
        }
      } else {
        // Create new listing in backend (either new listing or local-only listing that needs to be synced)
        // Note: listingId might exist from local storage, but we still need to create backend listing
        // Save new listing (user modified a newly generated listing)
        // Create new listing in backend (no existing backend listing)
        console.log('[Listing Save] Starting backend save for authenticated user');

        // Use existing storage_path if available (image was uploaded during analysis)
        // Otherwise, try to upload the image now
        // Note: payload may not exist when loading from my-listings, so we check it safely
        // Also check if payload was just updated (new listing from "add another item")
        const payloadStoragePath = payload?.storagePath;
        let currentStoragePath = storagePath || payloadStoragePath || '';

        // If we found a storagePath in payload but not in state, update state
        if (payloadStoragePath && !storagePath) {
          console.log('[Listing Save] Updating storagePath state from payload:', payloadStoragePath);
          setStoragePath(payloadStoragePath);
          currentStoragePath = payloadStoragePath;
        }

        console.log('[Listing Save] Storage path check:', {
          storagePathState: storagePath,
          payloadStoragePath: payloadStoragePath,
          currentStoragePath,
          hasImageUri: !!imageUri,
          hasPayload: !!payload,
        });

        // Only try to upload if we don't already have a storage_path
        if (!currentStoragePath && imageUri) {
            try {
              console.log('[Listing Save] Processing image:', imageUri.substring(0, 50) + '...');

              // Handle data URIs (already base64)
              let base64Image: string | null = null;
              if (imageUri && imageUri.startsWith('data:')) {
                base64Image = imageUri;
                console.log('[Listing Save] Image is already base64, length:', base64Image.length);
              } else if (imageUri) {
                // Read file and convert to base64
                const fileInfo = await FileSystem.getInfoAsync(imageUri);
                if (fileInfo.exists) {
                  console.log('[Listing Save] Reading image file...');
                  const base64 = await FileSystem.readAsStringAsync(imageUri, {
                    encoding: 'base64',
                  });

                  // Determine content type
                  let contentType = 'image/jpeg';
                  if (imageUri.includes('.png')) {
                    contentType = 'image/png';
                  } else if (imageUri.includes('.webp')) {
                    contentType = 'image/webp';
                  }

                  base64Image = `data:${contentType};base64,${base64}`;
                  console.log('[Listing Save] Image converted to base64, length:', base64Image.length);
                } else {
                  console.warn('[Listing Save] Image file does not exist:', imageUri);
                }
              }

              // Upload image if we have base64
              if (base64Image) {
                console.log('[Listing Save] Uploading image to backend...');
                const { data: uploadData, error: uploadError } = await uploadImage(base64Image);
                if (!uploadError && uploadData?.storage_path) {
                  currentStoragePath = uploadData.storage_path;
                  setStoragePath(currentStoragePath);
                  console.log('[Listing Save] Image uploaded successfully, storage_path:', currentStoragePath);
                } else {
                  console.error('[Listing Save] Failed to upload image:', uploadError);
                }
              } else {
                console.warn('[Listing Save] No base64 image available for upload');
              }
            } catch (imageError: any) {
              console.error('[Listing Save] Error processing image:', imageError);
            }
        } else if (!currentStoragePath) {
          console.log('[Listing Save] No image URI provided and no existing storage_path');
        } else {
          console.log('[Listing Save] Using existing storage_path from analysis:', currentStoragePath);
        }

        console.log('[Listing Save] About to create listing, currentStoragePath:', currentStoragePath);

        // Convert price to cents
        const priceCents = Math.round(parseFloat(price || '0') * 100);
        console.log('[Listing Save] Price converted to cents:', priceCents);

        // Determine currency code
        let currencyCode = 'USD';
        if (currency === '€') {
          currencyCode = 'EUR';
        } else if (currency === '£') {
          currencyCode = 'GBP';
        } else if (currency === '¥') {
          currencyCode = 'JPY';
        } else if (currency === 'kr') {
          currencyCode = 'NOK';
        }

        // Check if storage_path is required and available
        if (!currentStoragePath) {
          console.error('[Listing Save] Cannot create listing: storage_path is required but image upload failed or no image available');

            let errorMessage = 'Unable to upload image. ';
            if (!imageUri) {
              errorMessage += 'No image was provided.';
            } else if (imageUri.startsWith('file://')) {
              errorMessage += 'The image file may have been deleted from cache. Please analyze a new image.';
            } else {
              errorMessage += 'The image could not be processed. Please try again.';
            }
          errorMessage += ' The listing has been saved locally only.';

          Alert.alert(
            'Cannot Save to Backend',
            errorMessage,
            [{ text: 'OK' }]
          );
          // Fall back to local storage only
          savedListingId = await saveListing(currentListing, currency, imageUri || '');
        } else {
          // Create listing in backend
          console.log('[Listing Save] Creating listing in backend with params:', {
            title,
            description: description.substring(0, 50) + '...',
            price_cents: priceCents,
            currency: currencyCode,
            condition,
            storage_path: currentStoragePath,
          });

          console.log('[Listing Save] Calling createListing API...');
          const createResult = await createListing({
            title,
            description,
            price_cents: priceCents,
            currency: currencyCode,
            condition,
            storage_path: currentStoragePath || '',
            visibility: 'private',
          });

          const backendListing = createResult.listing;
          const createError = createResult.error;

          // Extract quota from response - quota is present when error is null (success case)
          // TypeScript doesn't narrow union types well, so we check error first
          let returnedQuota: UserQuota | null = null;
          if (!createError && backendListing) {
            // Success case - quota should be in the response
            const successResult = createResult as { listing: any; quota: UserQuota | null; error: null };
            returnedQuota = successResult.quota || null;
            console.log('[Listing Save] Extracted quota from response:', {
              hasQuota: !!returnedQuota,
              creations_remaining: returnedQuota?.creations_remaining_today,
              save_slots_remaining: returnedQuota?.save_slots_remaining,
            });
          }

          console.log('[Listing Save] createListing response:', {
            hasListing: !!backendListing,
            hasQuota: !!returnedQuota,
            hasError: !!createError,
            error: createError,
            listingId: backendListing?.id,
            quotaKeys: returnedQuota ? Object.keys(returnedQuota) : [],
          });

          if (createError) {
            console.error('[Listing Save] Backend error:', createError);

            // Handle quota exceeded - show friendly paywall
            if (createError.code === 'QUOTA_EXCEEDED') {
              // Refresh quota to get current limit
              try {
                const { quota: currentQuota } = await checkQuota();
                if (currentQuota) {
                  setQuota(currentQuota);
                  setShowPaywall(true);
                } else {
                  // Fallback to upgrade screen if quota check fails
                  router.push('/(tabs)/upgrade');
                }
              } catch (error) {
                // Fallback to upgrade screen
                router.push('/(tabs)/upgrade');
              }
            } else {
              const errorMessage = createError.message || 'Unknown error';
              console.warn('[Listing Save] Failed to save listing to backend, saving locally instead:', createError);
              Alert.alert(
                'Backend Save Failed',
                `Could not save to backend: ${errorMessage}. Listing saved locally only.`,
                [{ text: 'OK' }]
              );
              savedListingId = await saveListing(currentListing, currency, imageUri || '');
            }
          } else if (backendListing) {
            // Successfully saved to backend
            console.log('[Listing Save] Successfully saved to backend, listing ID:', backendListing.id);
            savedListingId = backendListing.id;
            setBackendListingId(backendListing.id);

            // Use quota from response if available, otherwise refresh quota
            try {
              const updatedQuota = returnedQuota || (await checkQuota()).quota;
              if (updatedQuota) {
                setQuota(updatedQuota);

                // Show progress toast
                setShowSaveSuccessToast(true);
                setTimeout(() => {
                  setShowSaveSuccessToast(false);
                }, 4000);

                // Show low slots warning if at 2 slots left
                if (updatedQuota.save_slots_remaining === 2) {
                  trackEvent('low_quota_nudge_shown', {
                    type: 'save',
                    remaining: updatedQuota.save_slots_remaining,
                  });
                  setShowLowSlotsWarning(true);
                }

                // Check quota modal if needed (using save slots as count)
                if (user?.id) {
                  const saveSlotsUsed = updatedQuota.free_save_slots - updatedQuota.save_slots_remaining;
                  const shouldShow = await checkQuotaModalShouldShow(user.id, saveSlotsUsed);
                  if (shouldShow) {
                    setQuotaCount(saveSlotsUsed);
                    setShowQuotaModal(true);
                  }
                }

                // Check if creations are exhausted after save (check total remaining)
                const totalRemaining = updatedQuota.creations?.total_remaining ??
                  (updatedQuota.creations_remaining_today + updatedQuota.bonus_creations_remaining);

                if (!updatedQuota.is_pro && totalRemaining === 0) {
                  trackEvent('generate_blocked_no_quota', {
                    creations_remaining: updatedQuota.creations_remaining_today,
                    total_remaining: totalRemaining,
                    creations_daily_limit: updatedQuota.creations_daily_limit,
                    context: 'after_save',
                  });
                  setShowBlockedModal(true);
                }
              }
            } catch (quotaError) {
              console.warn('[Listing Save] Failed to check quota for modal:', quotaError);
              // Don't block save if quota check fails
            }

            trackEvent('listing_saved', { listing_id: backendListing.id, user_id: user.id });
          } else {
            console.warn('[Listing Save] No listing returned from backend, but no error either');
            savedListingId = await saveListing(currentListing, currency, imageUri || '');
          }
        }

        // Update local storage with backend listing ID if we have one
        if (savedListingId && listingId) {
          // Update local listing to reference backend ID (for future updates)
          // Note: We keep the local listingId for backward compatibility
          console.log('[Listing Save] Backend listing created, keeping local listingId:', listingId);
        } else if (savedListingId) {
          // New listing - set the listingId
          setListingId(savedListingId);
        }
      }

      // Don't show alert for auto-save (silent save)
      // Only show success message if explicitly saving
      console.log('[Listing Save] Save operation completed', {
        savedListingId,
        backendListingId,
      });
    } catch (error: any) {
      console.error('[Listing Save] Unexpected error saving:', error);
      console.error('[Listing Save] Error stack:', error?.stack);
      Alert.alert(
        'Save Error',
        `Error saving listing: ${error?.message || 'Unknown error'}. Please check the console for details.`,
        [{ text: 'OK' }]
      );
    } finally {
      // Always reset the saving flag, even if there was an error
      isSavingRef.current = false;
    }
  };


  // Check if an error message looks technical (contains URLs, version numbers, technical jargon, etc.)
  const isTechnicalError = (message: string): boolean => {
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
  };

  // Transform technical error messages to cute Snappy messages
  const transformErrorMessage = (message: string): string => {
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

    return message;
  };

  const navigateToPreview = async (payload: { listing: ListingData; imageUri: string; listingId?: string; storagePath?: string; backendListingId?: string }) => {
    let listingId: string | undefined = payload.listingId;
    if (!listingId) {
      try {
        const preferences = await loadPreferences();
        const currency = preferences?.currency || '$';
        const { saveListing } = await import('@/utils/listings');
        const savedId = await saveListing(payload.listing, currency, payload.imageUri);
        listingId = savedId || undefined;
      } catch (error) {
        console.error('Failed to save listing:', error);
      }
    }

    const params = encodeURIComponent(JSON.stringify({
      ...payload,
      listingId,
    }));
    router.push({
      pathname: '/(tabs)/listing-preview',
      params: { payload: params },
    });
  };

  const processImage = async (asset: ImagePicker.ImagePickerAsset) => {
    setIsAnalyzing(true);
    setErrorMessage(null);

    // Create abort controller for cancellation
    const controller = new AbortController();
    setAbortController(controller);

    try {
      if (user) {
        const { quota: currentQuota, error: quotaError } = await checkQuota();

        // Calculate total remaining creations (free + purchased)
        const totalRemaining = currentQuota?.creations?.total_remaining ??
          (currentQuota ? (currentQuota.creations_remaining_today + currentQuota.bonus_creations_remaining) : 0);

        trackEvent('quota_checked', {
          has_quota: !!currentQuota,
          creations_remaining: currentQuota?.creations_remaining_today,
          total_remaining: totalRemaining,
          creations_daily_limit: currentQuota?.creations_daily_limit,
          save_slots_remaining: currentQuota?.save_slots_remaining,
          is_pro: currentQuota?.is_pro,
        });

        if (!quotaError && currentQuota && !currentQuota.is_pro && totalRemaining === 0) {
          trackEvent('generate_blocked_no_quota', {
            creations_remaining: currentQuota.creations_remaining_today,
            total_remaining: totalRemaining,
            creations_daily_limit: currentQuota.creations_daily_limit,
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

      const { formatListingText } = await import('@/utils/listingFormatter');
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

      let storagePath: string | undefined = undefined;
      if (user) {
        try {
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
            const { data: uploadData, error: uploadError } = await uploadImage(base64Image, asset.mimeType || 'image/jpeg');
            if (!uploadError && uploadData?.storage_path) {
              storagePath = uploadData.storage_path;
            }
          }
        } catch (error) {
          console.warn('[Image Analysis] Error uploading image:', error);
        }
      }

      navigateToPreview({ listing, imageUri: asset.uri, storagePath });

      if (user && returnedQuota) {
        setQuota(returnedQuota);

        // Check if creations are exhausted after analysis (check total remaining)
        const totalRemaining = returnedQuota.creations?.total_remaining ??
          (returnedQuota.creations_remaining_today + returnedQuota.bonus_creations_remaining);

        if (!returnedQuota.is_pro && totalRemaining === 0) {
          trackEvent('generate_blocked_no_quota', {
            creations_remaining: returnedQuota.creations_remaining_today,
            total_remaining: totalRemaining,
            creations_daily_limit: returnedQuota.creations_daily_limit,
            context: 'after_analysis',
          });
          setShowBlockedModal(true);
        } else if (!returnedQuota.is_pro) {
          // Check total remaining (free + purchased) for low quota nudge
          const totalRemaining = returnedQuota.creations?.total_remaining ??
            (returnedQuota.creations_remaining_today + returnedQuota.bonus_creations_remaining);

          if (totalRemaining <= 2) {
            trackEvent('low_quota_nudge_shown', {
              type: 'creation',
              remaining: totalRemaining,
            });
            setShowLowQuotaNudge(true);
          }
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

      if (errorCode === 'QUOTA_EXCEEDED' || rawMessage.includes('QUOTA_EXCEEDED')) {
        trackEvent('generate_blocked_no_quota', {
          error_source: 'api',
        });
        setIsAnalyzing(false);
        setShowBlockedModal(true);
      } else {
        const err = error instanceof Error ? error : new Error(String(error));
        trackError('image_analysis_error', err, { source: 'listing-preview' });
        setErrorMessage(transformErrorMessage(rawMessage));
      }
    } finally {
      setIsAnalyzing(false);
      setAbortController(null);
    }
  };

  const handleCancelAnalysis = () => {
    if (abortController) {
      trackEvent('analysis_cancelled', { source: 'listing-preview' });
      abortController.abort();
      setAbortController(null);
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

  // Helper function to dismiss a specific modal and navigate after it closes
  const dismissModalAndNavigate = (modalSetter: () => void, navigationCallback: () => void) => {
    // Dismiss the modal first
    modalSetter();

    // Wait for modal to close (React Native Modal needs time to animate out)
    // Use InteractionManager to wait for interactions to complete, then add a small delay
    InteractionManager.runAfterInteractions(() => {
      // Additional delay to ensure Modal component has fully closed
      // Modal fade animation is typically 200-300ms, so 150ms should be safe
      setTimeout(() => {
        navigationCallback();
      }, 150);
    });
  };

  // Helper function to dismiss all modals and ensure they're closed before navigation
  const dismissAllModalsAndNavigate = (navigationCallback: () => void) => {
    // Check if any modals are currently visible
    const hasVisibleModals =
      showQuotaModal ||
      showPaywall ||
      showBlockedModal ||
      showBlockedSaveModal ||
      showLowSlotsWarning ||
      showLowQuotaNudge ||
      showLoginGate;

    if (hasVisibleModals) {
      // Dismiss all modals first
      setShowQuotaModal(false);
      setShowPaywall(false);
      setShowBlockedModal(false);
      setShowBlockedSaveModal(false);
      setShowLowSlotsWarning(false);
      setShowLowQuotaNudge(false);
      setShowLoginGate(false);

      // Wait for modals to close (React Native Modal needs time to animate out)
      // Use InteractionManager to wait for interactions to complete, then add a small delay
      InteractionManager.runAfterInteractions(() => {
        // Additional delay to ensure Modal component has fully closed
        // Modal fade animation is typically 200-300ms, so 150ms should be safe
        setTimeout(() => {
          navigationCallback();
        }, 150);
      });
    } else {
      // No modals visible, navigate immediately but still use InteractionManager
      InteractionManager.runAfterInteractions(() => {
        navigationCallback();
      });
    }
  };

  const handleReset = () => {
    setCopySuccess(false);
    trackEvent('add_next_item_clicked', { source: 'listing-preview' });

    // Dismiss all modals first before showing the image picker alert
    // Alerts can be blocked by visible modals
    const hasVisibleModals =
      showQuotaModal ||
      showPaywall ||
      showBlockedModal ||
      showBlockedSaveModal ||
      showLowSlotsWarning ||
      showLowQuotaNudge ||
      showLoginGate;

    if (hasVisibleModals) {
      // Dismiss all modals first
      setShowQuotaModal(false);
      setShowPaywall(false);
      setShowBlockedModal(false);
      setShowBlockedSaveModal(false);
      setShowLowSlotsWarning(false);
      setShowLowQuotaNudge(false);
      setShowLoginGate(false);

      // Wait for modals to close before showing alert
      InteractionManager.runAfterInteractions(() => {
        setTimeout(() => {
          handlePickImage();
        }, 150);
      });
    } else {
      // No modals visible, show picker immediately
      handlePickImage();
    }
  };

  const handleGoToMyListings = () => {
    trackEvent('go_to_my_listings_clicked', { source: 'listing-preview' });

    dismissAllModalsAndNavigate(() => {
      router.push('/(tabs)/my-listings');
    });
  };

  const handleLocateMe = async () => {
    if (Platform.OS === 'web') {
      Alert.alert('Not available', 'Location services are not available on web.');
      return;
    }

    setIsLocating(true);
    trackEvent('location_button_pressed');
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission needed', 'Please allow SnapSell to access your location.');
        setIsLocating(false);
        return;
      }

      const location = await Location.getCurrentPositionAsync({});
      const geocode = await Location.reverseGeocodeAsync({
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      });

      if (geocode && geocode.length > 0) {
        const addr = geocode[0];
        const parts: string[] = [];
        if (addr.city) parts.push(addr.city);
        if (addr.region) parts.push(addr.region);
        if (addr.country) parts.push(addr.country);
        const newLocation = parts.join(', ') || '';
        trackFieldModification('location', prevLocationRef.current, newLocation);
        prevLocationRef.current = newLocation;
        setLocation(newLocation);
        setCopySuccess(false);
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to get location. Please enter it manually.');
    } finally {
      setIsLocating(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.root}>
        <ScrollView
          contentContainerStyle={styles.content}
          onScrollBeginDrag={() => {
            if (showConditionModal) {
              setShowConditionModal(false);
            }
            if (showCurrencyDropdown) {
              setShowCurrencyDropdown(false);
            }
          }}>
          <Text style={styles.eyebrow}>Listing preview</Text>
          <Text style={styles.header}>Tweak anything, then copy the finished block.</Text>

          {imageUri && (
            <Image
              source={{ uri: imageUri }}
              style={styles.photo}
              contentFit="cover"
              accessibilityLabel="Uploaded item"
            />
          )}

          <View style={styles.form}>
            <Field label="Title">
              <TextInput
                value={title}
                onChangeText={text => {
                  setTitle(text);
                  setCopySuccess(false);
                }}
                onBlur={() => {
                  trackFieldModification('title', prevTitleRef.current, title);
                  prevTitleRef.current = title;
                }}
                style={styles.input}
                placeholder="e.g. Mid-century oak chair"
              />
              <Text style={styles.helperText}>🦦 Adding brand info in the title boosts trust.</Text>
            </Field>

            <View style={styles.row}>
              <Field label="Price" style={styles.flex}>
                <View style={styles.priceRow}>
                  <View style={[styles.currencySelector, styles.dropdownContainer]}>
                    <Pressable
                      onPress={() => {
                        const wasOpen = showCurrencyDropdown;
                        setShowCurrencyDropdown(!showCurrencyDropdown);
                        setShowConditionModal(false);
                        if (!wasOpen) {
                          trackEvent('currency_dropdown_opened', { source: 'listing-preview' });
                        } else {
                          trackEvent('currency_dropdown_closed', { source: 'listing-preview' });
                        }
                      }}
                      style={styles.currencyButton}>
                      <Text style={styles.currencyButtonText}>{currency}</Text>
                      <Text style={styles.currencyButtonArrow}>{showCurrencyDropdown ? '▲' : '▼'}</Text>
                    </Pressable>
                    {showCurrencyDropdown && (
                      <View style={[styles.dropdown, styles.currencyDropdown]}>
                        <ScrollView
                          style={styles.dropdownScroll}
                          nestedScrollEnabled
                          showsVerticalScrollIndicator>
                          {CURRENCY_OPTIONS.map(option => (
                            <TouchableOpacity
                              key={option}
                              onPress={() => {
                                trackFieldModification('currency', prevCurrencyRef.current, option);
                                prevCurrencyRef.current = option;
                                setCurrency(option);
                                setCopySuccess(false);
                                setShowCurrencyDropdown(false);
                              }}
                              style={[
                                styles.dropdownOption,
                                currency === option && styles.dropdownOptionSelected,
                              ]}>
                              <Text
                                style={[
                                  styles.dropdownOptionText,
                                  currency === option && styles.dropdownOptionTextSelected,
                                ]}>
                                {option}
                              </Text>
                              {currency === option && <Text style={styles.dropdownOptionCheck}>✓</Text>}
                            </TouchableOpacity>
                          ))}
                        </ScrollView>
                      </View>
                    )}
                  </View>
                  <TextInput
                    value={price}
                    onChangeText={text => {
                      setPrice(text);
                      setCopySuccess(false);
                    }}
                    onBlur={() => {
                      trackFieldModification('price', prevPriceRef.current, price);
                      prevPriceRef.current = price;
                    }}
                    style={[styles.input, styles.priceInput]}
                    placeholder="120"
                    keyboardType="numeric"
                  />
                </View>
              </Field>
              <Field label="Condition" style={styles.flex}>
                <View style={styles.dropdownContainer}>
                  <Pressable
                    onPress={() => {
                      const wasOpen = showConditionModal;
                      setShowConditionModal(!showConditionModal);
                      setShowCurrencyDropdown(false);
                      if (!wasOpen) {
                        trackEvent('condition_modal_opened', { source: 'listing-preview' });
                      } else {
                        trackEvent('condition_modal_closed', { source: 'listing-preview' });
                      }
                    }}
                    style={styles.conditionButton}>
                    <Text style={styles.conditionButtonText}>{condition}</Text>
                    <Text style={styles.conditionButtonArrow}>
                      {showConditionModal ? '▲' : '▼'}
                    </Text>
                  </Pressable>
                  {showConditionModal && (
                    <View style={styles.dropdown}>
                      <ScrollView
                        style={styles.dropdownScroll}
                        nestedScrollEnabled
                        showsVerticalScrollIndicator>
                        {CONDITION_OPTIONS.map(option => (
                          <TouchableOpacity
                            key={option}
                            onPress={() => {
                              trackFieldModification('condition', prevConditionRef.current, option);
                              prevConditionRef.current = option;
                              setCondition(option);
                              setCopySuccess(false);
                              setShowConditionModal(false);
                            }}
                            style={[
                              styles.dropdownOption,
                              condition === option && styles.dropdownOptionSelected,
                            ]}>
                            <Text
                              style={[
                                styles.dropdownOptionText,
                                condition === option && styles.dropdownOptionTextSelected,
                              ]}>
                              {option}
                            </Text>
                            {condition === option && (
                              <Text style={styles.dropdownOptionCheck}>✓</Text>
                            )}
                          </TouchableOpacity>
                        ))}
                      </ScrollView>
                    </View>
                  )}
                </View>
              </Field>
            </View>

            <Field label="Location (optional)">
              <View style={styles.locationRow}>
                <TextInput
                  value={location}
                  onChangeText={text => {
                    setLocation(text);
                    setCopySuccess(false);
                  }}
                  onBlur={() => {
                    trackFieldModification('location', prevLocationRef.current, location);
                    prevLocationRef.current = location;
                  }}
                  style={[styles.input, styles.locationInput]}
                  placeholder="Oslo, Norway"
                />
                <Pressable
                  onPress={handleLocateMe}
                  disabled={isLocating}
                  style={({ pressed }) => [
                    styles.locateButton,
                    pressed && styles.locateButtonPressed,
                    isLocating && styles.locateButtonDisabled,
                  ]}>
                  <Text style={styles.locateButtonText}>
                    {isLocating ? 'Locating...' : 'Locate me'}
                  </Text>
                </Pressable>
              </View>
            </Field>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Pickup & shipping</Text>
              <View style={styles.toggleRow}>
                <Text style={styles.toggleLabel}>Pickup available</Text>
                <Switch
                  value={pickupAvailable}
                  onValueChange={value => {
                    trackFieldModification('pickupAvailable', prevPickupAvailableRef.current, value);
                    prevPickupAvailableRef.current = value;
                    setPickupAvailable(value);
                    setCopySuccess(false);
                  }}
                />
              </View>
              {pickupAvailable ? (
                <View style={styles.notesField}>
                  <Text style={styles.label}>Pickup notes (optional)</Text>
                  <TextInput
                    value={pickupNotes}
                    onChangeText={text => {
                      setPickupNotes(text);
                      setCopySuccess(false);
                    }}
                    onBlur={() => {
                      trackFieldModification('pickupNotes', prevPickupNotesRef.current, pickupNotes);
                      prevPickupNotesRef.current = pickupNotes;
                    }}
                    style={[styles.input, styles.textAreaSmall]}
                    placeholder="e.g. Evenings only, Oslo west"
                    multiline
                  />
                </View>
              ) : null}
              <View style={styles.toggleRow}>
                <Text style={styles.toggleLabel}>Shipping available</Text>
                <Switch
                  value={shippingAvailable}
                  onValueChange={value => {
                    trackFieldModification('shippingAvailable', prevShippingAvailableRef.current, value);
                    prevShippingAvailableRef.current = value;
                    setShippingAvailable(value);
                    setCopySuccess(false);
                  }}
                />
              </View>
            </View>

            <Field label="Description">
              <TextInput
                value={description}
                onChangeText={text => {
                  setDescription(text);
                  setCopySuccess(false);
                }}
                onBlur={() => {
                  trackFieldModification('description', prevDescriptionRef.current, description);
                  prevDescriptionRef.current = description;
                }}
                style={[styles.input, styles.textArea]}
                placeholder="Add measurements, wear-and-tear, pickup details…"
                multiline
                numberOfLines={5}
              />
            </Field>
          </View>

          <View style={styles.previewCard}>
            <View style={styles.previewHeader}>
              <View style={styles.previewIconContainer}>
                <Image
                  source={require('@/assets/images/snappy-money.png')}
                  style={styles.previewIcon}
                  contentFit="contain"
                />
              </View>
              <Text style={styles.previewTitle}>Listing preview</Text>
            </View>
            <Text style={styles.previewContent}>
              {previewText || 'Your formatted listing text will appear here as you fill the details.'}
            </Text>
          </View>

          <Pressable
            onPress={handleCopy}
            style={({ pressed }) => [styles.copyButton, pressed ? styles.copyButtonPressed : null]}>
            <Text style={styles.copyButtonText}>Copy listing text</Text>
          </Pressable>

          {copySuccess ? (
            <Text style={styles.success}>Copied! Paste it into your marketplace.</Text>
          ) : null}

          {/* Only show "Save this listing" checkbox for new listings (no backendListingId) */}
          {!backendListingId && (
            <View style={styles.autoSaveSection}>
              <View style={styles.toggleRow}>
                <View style={styles.toggleLabelContainer}>
                  <Text style={styles.toggleLabel}>
                    Save this listing for future
                    {user && quota && !quotaLoading && (
                      <Text style={styles.slotsCount}> ({quota.save_slots_remaining} left)</Text>
                    )}
                  </Text>
                </View>
                <Switch
                  value={autoSaveListing}
                  onValueChange={handleAutoSaveToggle}
                  disabled={user && quota && !quota.is_pro && quota.save_slots_remaining === 0}
                />
              </View>
              {!user && (
                <Text style={styles.autoSaveHint}>
                  Sign in to save your listings
                </Text>
              )}
              {user && (
                <Text style={styles.autoSaveHint}>
                  *Copy is always free.
                </Text>
              )}
            </View>
          )}

          {/* Show auto-save indicator for existing listings */}
          {backendListingId && user && (
            <View style={styles.autoSaveSection}>
              <Text style={styles.autoSaveHint}>
                Changes are saved automatically
              </Text>
            </View>
          )}

          {errorMessage ? (
            <Text style={styles.error}>{errorMessage}</Text>
          ) : null}

          {/* Only show "Add next item" button for new listings, not when editing existing ones */}
          {!backendListingId && (
            <Pressable
              onPress={handleReset}
              style={({ pressed }) => [styles.secondaryButton, pressed ? styles.secondaryButtonPressed : null]}
              disabled={isAnalyzing}>
              <Text style={styles.secondaryButtonText}>
                {isAnalyzing ? 'Creating listing…' : 'Add next item'}
              </Text>
            </Pressable>
          )}

          <Pressable
            onPress={handleGoToMyListings}
            style={({ pressed }) => [styles.tertiaryButton, pressed ? styles.tertiaryButtonPressed : null]}>
            <Text style={styles.tertiaryButtonText}>Done</Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>

      <LoginGateModal
        visible={showLoginGate}
        context="save"
        onDismiss={() => {
          setShowLoginGate(false);
        }}
        onLoginMethod={(method) => {
          // Method selection is handled in the modal
          // After login, user can check the checkbox
        }}
        onJustCopy={() => {
          handleCopy();
        }}
      />

      <QuotaModal
        visible={showQuotaModal}
        count={quotaCount}
        period={getQuotaPeriod()}
        onUpgrade={() => {
          dismissModalAndNavigate(() => setShowQuotaModal(false), () => {
            router.push('/(tabs)/upgrade');
          });
        }}
        onContinueFree={async () => {
          if (user?.id) {
            await markQuotaModalDismissed(user.id);
          }
        }}
        onDismiss={() => {
          setShowQuotaModal(false);
        }}
      />

      <SaveSlotsPaywall
        visible={showPaywall}
        limit={quota?.free_save_slots || 10}
        onBuySlots={() => {
          dismissModalAndNavigate(() => setShowPaywall(false), () => {
            router.push('/(tabs)/upgrade');
          });
        }}
        onGoUnlimited={() => {
          dismissModalAndNavigate(() => setShowPaywall(false), () => {
            router.push('/(tabs)/upgrade');
          });
        }}
        onDismiss={() => {
          setShowPaywall(false);
        }}
      />

      <LowSlotsWarning
        visible={showLowSlotsWarning}
        remaining={quota?.save_slots_remaining || 0}
        type="save"
        onDismiss={() => {
          setShowLowSlotsWarning(false);
        }}
        onUpgrade={() => {
          dismissModalAndNavigate(() => setShowLowSlotsWarning(false), () => {
            router.push('/(tabs)/upgrade');
          });
        }}
      />

      <SnappyLoading visible={isAnalyzing} onCancel={isAnalyzing ? handleCancelAnalysis : undefined} />
      {user && quota && (
        <>
          <BlockedQuotaModal
            visible={showBlockedModal}
            type="creation"
            creationsRemaining={quota.creations?.total_remaining ?? (quota.creations_remaining_today + quota.bonus_creations_remaining)}
            creationsDailyLimit={quota.creations?.daily_limit ?? quota.creations_daily_limit}
            onDismiss={() => setShowBlockedModal(false)}
            onPurchaseSuccess={() => {
              setShowBlockedModal(false);
              // Reload quota
              checkQuota().then(({ quota: updatedQuota }) => {
                if (updatedQuota) {
                  setQuota(updatedQuota);
                }
              });
            }}
          />
          <LowSlotsWarning
            visible={showLowQuotaNudge}
            remaining={quota.creations?.total_remaining ?? (quota.creations_remaining_today + quota.bonus_creations_remaining)}
            type="creation"
            onDismiss={() => setShowLowQuotaNudge(false)}
            onUpgrade={() => {
              dismissModalAndNavigate(() => setShowLowQuotaNudge(false), () => {
                router.push('/(tabs)/upgrade');
              });
            }}
          />
        </>
      )}

      {/* Save Success Toast */}
      {showSaveSuccessToast && quota && (
        <View style={styles.saveSuccessToast}>
          <Text style={styles.saveSuccessToastText}>
            Saved! 🎉 You have {quota.save_slots_remaining} Save Slot{quota.save_slots_remaining !== 1 ? 's' : ''} left.
          </Text>
        </View>
      )}

      {user && quota && (
        <BlockedQuotaModal
          visible={showBlockedSaveModal}
          type="save"
          saveSlotsRemaining={quota.save_slots_remaining}
          freeSaveSlots={quota.free_save_slots}
          onDismiss={() => setShowBlockedSaveModal(false)}
          onPurchaseSuccess={async () => {
            setShowBlockedSaveModal(false);
            // Reload quota after purchase
            const { quota: updatedQuota } = await checkQuota();
            if (updatedQuota) {
              setQuota(updatedQuota);
            }
          }}
        />
      )}
    </SafeAreaView>
  );
}

type FieldProps = {
  label: string;
  children: ReactNode;
  style?: object;
};

function Field({ label, children, style }: FieldProps) {
  return (
    <View style={[styles.field, style]}>
      <Text style={styles.label}>{label}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  root: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  content: {
    padding: 24,
    paddingBottom: 24,
    gap: 16,
  },
  eyebrow: {
    fontSize: 12,
    letterSpacing: 1.2,
    color: '#64748B',
    textTransform: 'uppercase',
    fontWeight: '600',
  },
  header: {
    fontSize: 24,
    fontWeight: '700',
    color: '#0F172A',
    lineHeight: 30,
  },
  photo: {
    width: '100%',
    height: 260,
    borderRadius: 16,
  },
  form: {
    gap: 16,
  },
  field: {
    gap: 8,
  },
  label: {
    fontSize: 14,
    color: '#475569',
    fontWeight: '600',
  },
  helperText: {
    fontSize: 13,
    color: '#64748B',
    marginTop: -4,
  },
  input: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: '#0F172A',
    backgroundColor: '#F8FAFC',
  },
  textArea: {
    minHeight: 120,
    textAlignVertical: 'top',
  },
  textAreaSmall: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  flex: {
    flex: 1,
  },
  conditionButton: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: '#F8FAFC',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  conditionButtonText: {
    fontSize: 16,
    color: '#0F172A',
    flex: 1,
  },
  conditionButtonArrow: {
    fontSize: 12,
    color: '#64748B',
    marginLeft: 8,
  },
  dropdownContainer: {
    position: 'relative',
    zIndex: 1000,
  },
  dropdown: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    marginTop: 4,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 8,
    maxHeight: 250,
    overflow: 'hidden',
  },
  dropdownScroll: {
    maxHeight: 250,
  },
  dropdownOption: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  dropdownOptionSelected: {
    backgroundColor: '#EEF2FF',
  },
  dropdownOptionText: {
    fontSize: 16,
    color: '#0F172A',
    flex: 1,
  },
  dropdownOptionTextSelected: {
    fontWeight: '600',
    color: '#4338CA',
  },
  dropdownOptionCheck: {
    fontSize: 16,
    color: '#4338CA',
    marginLeft: 8,
    fontWeight: '700',
  },
  priceRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  currencySelector: {
    minWidth: 60,
  },
  currencyButton: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: '#F8FAFC',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
  },
  currencyButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#0F172A',
  },
  currencyButtonArrow: {
    fontSize: 12,
    color: '#64748B',
  },
  currencyDropdown: {
    zIndex: 1000,
    width: 140,
  },
  priceInput: {
    flex: 1,
  },
  locationRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'flex-start',
  },
  locationInput: {
    flex: 1,
  },
  locateButton: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#EEF2FF',
    borderWidth: 1,
    borderColor: '#CBD5F5',
    justifyContent: 'center',
    alignItems: 'center',
    minWidth: 100,
  },
  locateButtonPressed: {
    backgroundColor: '#E0E7FF',
  },
  locateButtonDisabled: {
    opacity: 0.5,
  },
  locateButtonText: {
    color: '#4338CA',
    fontSize: 14,
    fontWeight: '600',
  },
  section: {
    gap: 12,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#475569',
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  toggleLabel: {
    fontSize: 16,
    color: '#0F172A',
    fontWeight: '500',
  },
  notesField: {
    gap: 8,
  },
  previewCard: {
    marginTop: 8,
    backgroundColor: '#EFF6FF',
    borderRadius: 14,
    padding: 20,
    gap: 8,
    borderWidth: 1,
    borderColor: '#BFDBFE',
    shadowColor: '#93C5FD',
    shadowOpacity: 0.2,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  previewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  previewTitle: {
    color: '#0369A1',
    fontSize: 13,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    fontWeight: '700',
  },
  previewIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#0EA5E9',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  previewIcon: {
    width: '100%',
    height: '100%',
  },
  previewContent: {
    color: '#1F2937',
    fontSize: 16,
    lineHeight: 22,
    fontFamily: Platform.select({
      ios: 'MarkerFelt-Wide',
      android: 'casual',
      default: 'Comic Sans MS',
    }),
  },
  copyButton: {
    backgroundColor: '#0F172A',
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
  },
  copyButtonPressed: {
    opacity: 0.85,
  },
  copyButtonText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 16,
  },
  success: {
    color: '#16A34A',
    fontSize: 14,
  },
  secondaryButton: {
    borderWidth: 1,
    borderColor: '#CBD5F5',
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
  },
  secondaryButtonPressed: {
    backgroundColor: '#EEF2FF',
  },
  secondaryButtonText: {
    color: '#312E81',
    fontWeight: '600',
  },
  autoSaveSection: {
    marginTop: 16,
    padding: 16,
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  autoSaveHint: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 8,
    fontStyle: 'italic',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  loadingText: {
    fontSize: 16,
    color: '#64748B',
  },
  toggleLabelContainer: {
    flex: 1,
    marginRight: 12,
  },
  slotsCount: {
    fontSize: 14,
    fontWeight: '600',
    color: '#4338CA',
  },
  saveSuccessToast: {
    position: 'absolute',
    bottom: 100,
    left: 16,
    right: 16,
    backgroundColor: '#F0FDF4',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#BBF7D0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
    zIndex: 1000,
  },
  saveSuccessToastText: {
    fontSize: 14,
    color: '#166534',
    fontWeight: '600',
    textAlign: 'center',
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
    marginTop: 8,
    marginBottom: 8,
    textAlign: 'center',
  },
  tertiaryButton: {
    marginTop: 4,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
  },
  tertiaryButtonPressed: {
    opacity: 0.7,
  },
  tertiaryButtonText: {
    color: '#64748B',
    fontWeight: '600',
    fontSize: 16,
  },
});
