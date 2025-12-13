import * as Clipboard from 'expo-clipboard';
import * as FileSystem from 'expo-file-system/legacy';
import * as ImagePicker from 'expo-image-picker';
import * as MediaLibrary from 'expo-media-library';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
  Alert,
  Image,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BlockedQuotaModal } from '@/components/BlockedQuotaModal';
import { LowSlotsWarning } from '@/components/LowSlotsWarning';
import { SnappyLoading } from '@/components/snappy-loading';
import { useAuth } from '@/contexts/AuthContext';
import { trackError, trackEvent, trackScreenView } from '@/utils/analytics';
import { analyzeItemPhoto, type ListingData } from '@/utils/api';
import { formatListingText } from '@/utils/listingFormatter';
import { saveListing } from '@/utils/listings';
import { checkQuota, deleteListing as deleteListingApi, getMyListings, type UserQuota } from '@/utils/listings-api';
import { loadPreferences } from '@/utils/preferences';

interface Listing {
  id: string;
  title: string;
  description: string;
  price_cents: number;
  currency: string;
  condition?: string;
  image_url?: string;
  storage_path?: string;
  created_at: string;
}

export default function MyListingsScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [copySuccessId, setCopySuccessId] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [quota, setQuota] = useState<UserQuota | null>(null);
  const [showBlockedModal, setShowBlockedModal] = useState(false);
  const [showLowQuotaNudge, setShowLowQuotaNudge] = useState(false);
  const [abortController, setAbortController] = useState<AbortController | null>(null);

  const ctaLabel = useMemo(
    () => (isAnalyzing ? 'Creating listing…' : 'Create Listing'),
    [isAnalyzing],
  );

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

  const loadQuota = useCallback(async () => {
    if (!user) {
      setQuota(null);
      return null;
    }

    try {
      const { quota: userQuota, error } = await checkQuota();
      if (error) {
        setQuota(null);
        return null;
      } else if (userQuota) {
        setQuota(userQuota);
        if (!userQuota.is_pro && userQuota.creations_remaining_today <= 2) {
          trackEvent('low_quota_nudge_shown', {
            type: 'creation',
            remaining: userQuota.creations_remaining_today,
          });
          setShowLowQuotaNudge(true);
        }
        return userQuota;
      }
      return null;
    } catch (error) {
      setQuota(null);
      return null;
    }
  }, [user]);

  const navigateToPreview = async (payload: { listing: ListingData; imageUri: string; listingId?: string; storagePath?: string; backendListingId?: string }) => {
    let listingId: string | undefined = payload.listingId;
    if (!listingId) {
      try {
        const preferences = await loadPreferences();
        const currency = preferences?.currency || '$';
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
        trackEvent('quota_checked', {
          has_quota: !!currentQuota,
          creations_remaining: currentQuota?.creations_remaining_today,
          creations_daily_limit: currentQuota?.creations_daily_limit,
          save_slots_remaining: currentQuota?.save_slots_remaining,
          is_pro: currentQuota?.is_pro,
        });

        if (!quotaError && currentQuota && !currentQuota.is_pro && currentQuota.creations_remaining_today === 0) {
          trackEvent('generate_blocked_no_quota', {
            creations_remaining: currentQuota.creations_remaining_today,
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
            const { uploadImage } = await import('@/utils/listings-api');
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

      if (user) {
        const updatedQuota = returnedQuota || await loadQuota();
        if (updatedQuota) {
          setQuota(updatedQuota);
          if (!updatedQuota.is_pro && updatedQuota.creations_remaining_today <= 2) {
            trackEvent('low_quota_nudge_shown', {
              type: 'creation',
              remaining: updatedQuota.creations_remaining_today,
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
        trackError('image_analysis_error', err, { source: 'my-listings' });
        setErrorMessage(transformErrorMessage(rawMessage));
      }
    } finally {
      setIsAnalyzing(false);
      setAbortController(null);
    }
  };

  const handleCancelAnalysis = () => {
    if (abortController) {
      trackEvent('analysis_cancelled', { source: 'my-listings' });
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

  const loadListings = useCallback(async () => {
    if (!user) {
      setListings([]);
      setLoading(false);
      return;
    }

    try {
      const { listings: userListings, error } = await getMyListings();
      if (error) {
        console.error('Error loading listings:', error);
        setListings([]);
      } else {
        setListings(userListings || []);
      }
    } catch (error) {
      console.error('Error loading listings:', error);
      setListings([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      trackScreenView('my-listings', { is_authenticated: !!user });
      // Add a small delay to ensure any pending saves have completed
      // This is especially important for auto-save which has a debounce
      const timer = setTimeout(() => {
        loadListings();
      }, 300);

      return () => clearTimeout(timer);
    }, [loadListings, user])
  );

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    trackEvent('listings_refreshed', { is_authenticated: !!user });
    loadListings();
  }, [loadListings, user]);

  const handleDeleteListing = (listing: Listing) => {
    Alert.alert(
      'Delete listing',
      `Are you sure you want to delete "${listing.title || 'this listing'}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            const { error } = await deleteListingApi(listing.id);
            if (error) {
              const err = error instanceof Error ? error : new Error('Failed to delete listing');
              trackError('listing_deletion_error', err, { listing_id: listing.id });
              Alert.alert('Error', 'Failed to delete listing. Please try again.');
            } else {
              trackEvent('listing_deleted', { listing_id: listing.id });
              loadListings();
            }
          },
        },
      ]
    );
  };

  const handleListingPress = async (listing: Listing) => {
    // Copy listing text to clipboard
    const listingText = formatListingText({
      title: listing.title,
      price: (listing.price_cents / 100).toString(),
      description: listing.description,
      condition: listing.condition || '',
      location: '',
      currency: listing.currency || '$',
    });
    await Clipboard.setStringAsync(listingText);
    trackEvent('listing_copied', { source: 'my-listings' });
    setCopySuccessId(listing.id);
    setTimeout(() => setCopySuccessId(null), 2000);
  };

  const handleListingLongPress = (listing: Listing) => {
    // Navigate to preview/edit screen
    trackEvent('listing_edited', { listing_id: listing.id, source: 'my-listings' });
    router.push({
      pathname: '/(tabs)/listing-preview',
      params: {
        listingId: listing.id,
      },
    });
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Loading listings...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!user) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
          <Text style={styles.title}>My Listings</Text>
          <View style={styles.signInCard}>
            <Text style={styles.signInCardTitle}>Sign in to view your saved listings</Text>
            <Text style={styles.signInCardDescription}>
              Create an account to save your listings, access them from anywhere, and never lose your work.
            </Text>
            <Pressable
              onPress={() => {
                trackEvent('sign_in_prompt_shown', { context: 'my-listings' });
                router.push('/(auth)/sign-in');
              }}
              style={({ pressed }) => [
                styles.signInButton,
                pressed && styles.signInButtonPressed,
              ]}>
              <Text style={styles.signInButtonText}>Sign In</Text>
            </Pressable>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }>
        <Text style={styles.title}>My Listings</Text>

        {listings.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No saved listings yet</Text>
            <Text style={styles.emptySubtext}>Create your first listing to get started</Text>
          </View>
        ) : (
          <View style={styles.listingsContainer}>
            {listings.map(listing => {
              const listingText = formatListingText({
                title: listing.title,
                price: (listing.price_cents / 100).toString(),
                description: listing.description,
                condition: listing.condition || '',
                location: '',
                currency: listing.currency || '$',
              });
              const isCopied = copySuccessId === listing.id;

              return (
                <Pressable
                  key={listing.id}
                  onPress={() => handleListingPress(listing)}
                  onLongPress={() => handleListingLongPress(listing)}
                  style={({ pressed }) => [
                    styles.listingCard,
                    pressed && styles.listingCardPressed,
                    isCopied && styles.listingCardCopied,
                  ]}>
                  {listing.image_url ? (
                    <Image
                      source={{ uri: listing.image_url }}
                      style={styles.listingImage}
                      resizeMode="cover"
                    />
                  ) : null}
                  <View style={styles.listingContent}>
                    <View style={styles.listingHeader}>
                      <Text style={styles.listingTitle} numberOfLines={1}>
                        {listing.title || 'Untitled listing'}
                      </Text>
                      <View style={styles.listingHeaderActions}>
                        {isCopied && <Text style={styles.copiedBadge}>Copied!</Text>}
                        <Pressable
                          onPress={() => handleDeleteListing(listing)}
                          style={styles.deleteButton}>
                          <Text style={styles.deleteButtonText}>🗑️</Text>
                        </Pressable>
                      </View>
                    </View>
                    <Text style={styles.listingText} numberOfLines={3}>
                      {listingText}
                    </Text>
                    <Text style={styles.listingDate}>
                      {new Date(listing.created_at).toLocaleDateString()}
                    </Text>
                    <Text style={styles.listingCardHint}>
                      Tap to copy • Long press to edit
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
        )}
      </ScrollView>

      {listings.length === 0 && user && (
        <View style={styles.fabContainer}>
          <Pressable
            onPress={() => {
              trackEvent('create_listing_from_empty_state', { source: 'my-listings' });
              handlePickImage();
            }}
            style={({ pressed }) => [
              styles.fabButton,
              pressed && styles.fabButtonPressed,
            ]}
            disabled={isAnalyzing}>
            <Text style={styles.fabIcon}>+</Text>
            <Text style={styles.fabText}>{ctaLabel}</Text>
          </Pressable>
          {errorMessage ? <Text style={styles.error}>{errorMessage}</Text> : null}
        </View>
      )}
      <SnappyLoading visible={isAnalyzing} onCancel={isAnalyzing ? handleCancelAnalysis : undefined} />
      {user && quota && (
        <>
          <BlockedQuotaModal
            visible={showBlockedModal}
            type="creation"
            creationsRemaining={quota.creations_remaining_today}
            creationsDailyLimit={quota.creations_daily_limit}
            onDismiss={() => setShowBlockedModal(false)}
            onPurchaseSuccess={() => {
              setShowBlockedModal(false);
              loadQuota();
            }}
          />
          <LowSlotsWarning
            visible={showLowQuotaNudge}
            remaining={quota.creations_remaining_today}
            type="creation"
            onDismiss={() => setShowLowQuotaNudge(false)}
            onUpgrade={() => {
              setShowLowQuotaNudge(false);
              router.push('/(tabs)/upgrade');
            }}
          />
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
  scrollView: {
    flex: 1,
  },
  content: {
    padding: 24,
    paddingBottom: 120, // Extra padding for FAB
    flexGrow: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 16,
    color: '#64748B',
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 24,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 48,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#475569',
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#64748B',
    textAlign: 'center',
  },
  listingsContainer: {
    gap: 16,
  },
  listingCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  listingCardPressed: {
    opacity: 0.8,
  },
  listingCardCopied: {
    borderColor: '#16A34A',
    backgroundColor: '#F0FDF4',
  },
  listingImage: {
    width: '100%',
    height: 200,
  },
  listingContent: {
    padding: 16,
  },
  listingHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  listingHeaderActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  copiedBadge: {
    fontSize: 12,
    color: '#16A34A',
    fontWeight: '600',
  },
  listingTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0F172A',
    flex: 1,
  },
  deleteButton: {
    padding: 4,
  },
  deleteButtonText: {
    fontSize: 18,
  },
  listingText: {
    fontSize: 14,
    color: '#475569',
    lineHeight: 20,
    marginBottom: 8,
  },
  listingDate: {
    fontSize: 12,
    color: '#94A3B8',
    marginBottom: 4,
  },
  listingCardHint: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 4,
    fontStyle: 'italic',
  },
  signInCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 24,
    marginTop: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
    alignItems: 'center',
  },
  signInCardTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 12,
    textAlign: 'center',
  },
  signInCardDescription: {
    fontSize: 14,
    color: '#64748B',
    lineHeight: 20,
    textAlign: 'center',
    marginBottom: 24,
  },
  signInButton: {
    backgroundColor: '#4338CA',
    paddingVertical: 12,
    paddingHorizontal: 32,
    borderRadius: 8,
    minWidth: 120,
  },
  signInButtonPressed: {
    opacity: 0.85,
  },
  signInButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
  fabContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 16,
    paddingBottom: 32,
    backgroundColor: 'transparent',
    alignItems: 'center',
  },
  fabButton: {
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
  fabButtonPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.98 }],
  },
  fabIcon: {
    fontSize: 24,
    fontWeight: '700',
    color: '#FFFFFF',
    lineHeight: 28,
  },
  fabText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
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
    textAlign: 'center',
  },
});
