import * as Clipboard from 'expo-clipboard';
import { Image } from 'expo-image';
import * as Location from 'expo-location';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
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

import { trackEvent } from '@/utils/analytics';
import type { ListingData } from '@/utils/api';
import { formatListingText } from '@/utils/listingFormatter';
import { saveListing, updateListing } from '@/utils/listings';
import { loadPreferences, savePreferences, type UserPreferences } from '@/utils/preferences';
import * as Sharing from 'expo-sharing';
import { useAuth } from '@/contexts/AuthContext';
import { createListing, updateListing as updateListingApi } from '@/utils/listings-api';

type PreviewPayload = {
  listing: ListingData;
  imageUri: string;
  listingId?: string;
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
  const params = useLocalSearchParams<{ payload?: string }>();
  const { user } = useAuth();
  const [shareLink, setShareLink] = useState<string | null>(null);
  const [shareSuccess, setShareSuccess] = useState(false);
  const [backendListingId, setBackendListingId] = useState<string | null>(null);

  const payload = useMemo<PreviewPayload | null>(() => {
    if (!params.payload) return null;
    try {
      return JSON.parse(decodeURIComponent(params.payload));
    } catch {
      return null;
    }
  }, [params.payload]);

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

  useEffect(() => {
    if (!payload) {
      Alert.alert('Upload required', 'Please add an item before opening the preview.', [
        { text: 'OK', onPress: () => router.replace('/(tabs)/') },
      ]);
    } else {
      // Update listingId when payload changes
      setListingId(payload.listingId);
      // Reset modifications when payload changes (new listing loaded)
      setModifications([]);
      // Reset initial values so they get recalculated for the new listing
      setInitialValues(null);
    }
  }, [payload, router]);

  // Load saved preferences on mount
  useEffect(() => {
    const loadSavedPreferences = async () => {
      const prefs = await loadPreferences();
      if (prefs) {
        // Only apply preferences if they're not already set from the listing
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
      };
      await savePreferences(prefs);
    };
    // Debounce saves to avoid too many writes
    const timer = setTimeout(savePrefs, 500);
    return () => clearTimeout(timer);
  }, [location, pickupAvailable, shippingAvailable, pickupNotes, currency]);


  if (!payload) {
    return null;
  }

  // Helper function to normalize values for comparison
  const normalizeValue = (value: any): any => {
    if (typeof value === 'string') {
      return value.trim();
    }
    return value;
  };

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

    // Save or update listing
    if (listingId) {
      // Update existing listing
      await updateListing(listingId, currentListing, currency);
    } else {
      // Save new listing (user modified a newly generated listing)
      const newListingId = await saveListing(currentListing, currency, payload?.imageUri || '');
      if (newListingId) {
        setListingId(newListingId);
      }
    }

    setCopySuccess(true);
  };

  const handleShare = async () => {
    if (!user) {
      Alert.alert('Sign in required', 'Please sign in to share listings.');
      return;
    }

    try {
      // Check if backend is configured
      const EDGE_FUNCTION_BASE = process.env.EXPO_PUBLIC_SUPABASE_FUNCTIONS_URL ||
        `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1`;

      if (!EDGE_FUNCTION_BASE || EDGE_FUNCTION_BASE.includes('YOUR_') || EDGE_FUNCTION_BASE.includes('your_')) {
        Alert.alert(
          'Backend not configured',
          'Sharing requires backend setup. Please configure your Supabase Edge Functions.',
          [{ text: 'OK' }]
        );
        return;
      }

      // First, ensure listing is saved to backend
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

      let listingIdToShare = backendListingId;

      // If no backend listing ID, create one
      if (!listingIdToShare) {
        // Convert price to cents
        const priceCents = Math.round(parseFloat(price || '0') * 100);

        // For now, we'll need to upload the image first
        // This is a simplified version - in production, you'd want to handle image upload properly
        const { listing: newListing, error: createError } = await createListing({
          title,
          description,
          price_cents: priceCents,
          currency: currency === '$' ? 'USD' : currency,
          condition,
          storage_path: '', // This would need to be set from image upload
          visibility: 'shared',
        });

        if (createError) {
          if (createError.code === 'QUOTA_EXCEEDED') {
            Alert.alert(
              'Quota Exceeded',
              'You\'ve reached your listing limit. Upgrade to share more listings.',
              [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Upgrade', onPress: () => router.push('/(tabs)/upgrade') },
              ]
            );
          } else {
            // Check if it's a server error (backend not available)
            const errorMessage = createError.message || '';
            if (errorMessage.includes('Internal server error') || errorMessage.includes('Failed to fetch')) {
              Alert.alert(
                'Backend unavailable',
                'Unable to connect to the backend. Please check your configuration or try again later.',
                [{ text: 'OK' }]
              );
            } else {
              Alert.alert('Error', 'Failed to create listing for sharing. Please try again.');
            }
          }
          return;
        }

        if (newListing) {
          listingIdToShare = newListing.id;
          setBackendListingId(newListing.id);
          if (newListing.share_slug) {
            setShareLink(newListing.share_slug);
          }
        }
      } else {
        // Update existing listing
        const priceCents = Math.round(parseFloat(price || '0') * 100);
        const { error: updateError } = await updateListingApi(listingIdToShare, {
          title,
          description,
          price_cents: priceCents,
          currency: currency === '$' ? 'USD' : currency,
          condition,
        });

        if (updateError) {
          console.warn('Failed to update listing for share:', updateError);
          // Continue anyway - we can still share with existing data
        }
      }

      // Generate share link
      const shareBaseUrl = process.env.EXPO_PUBLIC_SHARE_BASE_URL || 'snapsell://share';
      const slug = shareLink || listingIdToShare; // Use share_slug if available, otherwise use ID
      const shareUrl = `${shareBaseUrl}/${slug}`;

      // Copy to clipboard and show native share sheet
      await Clipboard.setStringAsync(shareUrl);
      setShareSuccess(true);
      setTimeout(() => setShareSuccess(false), 3000);

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(shareUrl);
      }

      trackEvent('listing_shared', { listing_id: listingIdToShare });
    } catch (error: any) {
      console.error('Share error:', error);
      const errorMessage = error?.message || '';
      if (errorMessage.includes('Failed to fetch') || errorMessage.includes('network')) {
        Alert.alert(
          'Connection error',
          'Unable to connect to the backend. Please check your internet connection and try again.',
          [{ text: 'OK' }]
        );
      } else {
        Alert.alert('Error', 'Failed to share listing. Please try again.');
      }
    }
  };

  const handleReset = () => {
    setCopySuccess(false);
    router.replace('/(tabs)/');
  };

  const handleLocateMe = async () => {
    if (Platform.OS === 'web') {
      Alert.alert('Not available', 'Location services are not available on web.');
      return;
    }

    setIsLocating(true);
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

          <Image
            source={{ uri: payload.imageUri }}
            style={styles.photo}
            contentFit="cover"
            accessibilityLabel="Uploaded item"
          />

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
                        setShowCurrencyDropdown(!showCurrencyDropdown);
                        setShowConditionModal(false);
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
                      setShowConditionModal(!showConditionModal);
                      setShowCurrencyDropdown(false);
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

          {shareSuccess ? (
            <Text style={styles.success}>Share link copied to clipboard!</Text>
          ) : null}

          {user && (
            <Pressable
              onPress={handleShare}
              style={({ pressed }) => [
                styles.shareButton,
                pressed && styles.shareButtonPressed,
              ]}>
              <Text style={styles.shareButtonText}>Share listing</Text>
            </Pressable>
          )}

          <Pressable
            onPress={handleReset}
            style={({ pressed }) => [styles.secondaryButton, pressed ? styles.secondaryButtonPressed : null]}>
            <Text style={styles.secondaryButtonText}>Add next item</Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
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
    paddingBottom: 48,
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
  shareButton: {
    backgroundColor: '#4338CA',
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  shareButtonPressed: {
    opacity: 0.85,
  },
  shareButtonText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 16,
  },
});
