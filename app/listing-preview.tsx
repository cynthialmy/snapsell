import * as Clipboard from 'expo-clipboard';
import { Image } from 'expo-image';
import * as Location from 'expo-location';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { type ReactNode, useEffect, useMemo, useState } from 'react';
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
import { loadPreferences, savePreferences, type UserPreferences } from '@/utils/preferences';

type PreviewPayload = {
  listing: ListingData;
  imageUri: string;
};

const CONDITION_OPTIONS = ['New', 'Used - Like New', 'Used - Good', 'Used - Fair', 'Refurbished'];

const CURRENCY_OPTIONS = ['$', '€', '£', 'kr', '¥'];

export default function ListingPreviewScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ payload?: string }>();

  const payload = useMemo<PreviewPayload | null>(() => {
    if (!params.payload) return null;
    try {
      return JSON.parse(decodeURIComponent(params.payload));
    } catch {
      return null;
    }
  }, [params.payload]);

  const listing = payload?.listing;

  const [title, setTitle] = useState(listing?.title ?? '');
  const [price, setPrice] = useState(listing?.price ?? '');
  const [description, setDescription] = useState(listing?.description ?? '');
  const [condition, setCondition] = useState(() => {
    const candidate = listing?.condition;
    if (candidate && CONDITION_OPTIONS.includes(candidate)) {
      return candidate;
    }
    return CONDITION_OPTIONS[2];
  });
  const [location, setLocation] = useState(listing?.location ?? '');
  const [pickupAvailable, setPickupAvailable] = useState(listing?.pickupAvailable ?? false);
  const [shippingAvailable, setShippingAvailable] = useState(listing?.shippingAvailable ?? false);
  const [pickupNotes, setPickupNotes] = useState(listing?.pickupNotes ?? '');
  const [copySuccess, setCopySuccess] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const [showConditionModal, setShowConditionModal] = useState(false);
  const [showCurrencyDropdown, setShowCurrencyDropdown] = useState(false);
  const [currency, setCurrency] = useState<string>('$');

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
        { text: 'OK', onPress: () => router.replace('/') },
      ]);
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
    };
    loadSavedPreferences();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  const handleCopy = async () => {
    await Clipboard.setStringAsync(previewText);
    trackEvent('listing_copied', { source: 'preview' });
    setCopySuccess(true);
  };

  const handleReset = () => {
    setCopySuccess(false);
    router.replace('/');
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
        setLocation(parts.join(', ') || '');
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
                style={[styles.input, styles.textArea]}
                placeholder="Add measurements, wear-and-tear, pickup details…"
                multiline
                numberOfLines={5}
              />
            </Field>
          </View>

          <View style={styles.previewCard}>
            <Text style={styles.previewTitle}>Listing preview</Text>
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
  previewTitle: {
    color: '#0369A1',
    fontSize: 13,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    fontWeight: '700',
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
});
