import * as FileSystem from 'expo-file-system/legacy';
import * as ImagePicker from 'expo-image-picker';
import * as MediaLibrary from 'expo-media-library';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
    Alert,
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
import { trackEvent, trackScreenView } from '@/utils/analytics';
import { analyzeItemPhoto, type ListingData } from '@/utils/api';
import { formatListingText } from '@/utils/listingFormatter';
import { saveListing } from '@/utils/listings';
import { checkQuota, type UserQuota } from '@/utils/listings-api';
import { loadPreferences } from '@/utils/preferences';

// Transform technical error messages to cute Snappy messages
function transformErrorMessage(message: string): string {
  const lowerMessage = message.toLowerCase();

  // Check for technical terms and replace with cute messages
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

  // If it's already a cute message (contains "Snappy"), return as-is
  if (lowerMessage.includes('snappy')) {
    return message;
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
  const [quotaLoading, setQuotaLoading] = useState(false);
  const [showBlockedModal, setShowBlockedModal] = useState(false);
  const [showLowQuotaNudge, setShowLowQuotaNudge] = useState(false);

  const ctaLabel = useMemo(
    () => (isAnalyzing ? 'Analyzing photo…' : 'Snap / Upload Item'),
    [isAnalyzing],
  );

  const processImage = async (asset: ImagePicker.ImagePickerAsset) => {
    setIsAnalyzing(true);
    setErrorMessage(null);

    try {
      // Check quota if user is authenticated
      if (user) {
        const { quota: currentQuota, error: quotaError } = await checkQuota();
        trackEvent('quota_checked', {
          has_quota: !!currentQuota,
          creations_remaining: currentQuota?.creations_remaining_today,
          creations_daily_limit: currentQuota?.creations_daily_limit,
          save_slots_remaining: currentQuota?.save_slots_remaining,
          is_pro: currentQuota?.is_pro,
        });

        // Check if user can create (not Pro and no creations remaining)
        if (!quotaError && currentQuota && !currentQuota.is_pro && currentQuota.creations_remaining_today === 0) {
          // Quota exceeded - show blocked modal
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

      const listing = await analyzeItemPhoto({
        uri: asset.uri,
        filename: asset.fileName ?? 'snapsell-item.jpg',
        mimeType: asset.mimeType ?? 'image/jpeg',
        currency,
        onStatusChange: setErrorMessage,
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

      // Reload quota after successful listing creation
      if (user) {
        const { quota: updatedQuota } = await loadQuota();
        // Show low quota nudge if creations <= 2
        if (updatedQuota && !updatedQuota.is_pro && updatedQuota.creations_remaining_today <= 2) {
          trackEvent('low_quota_nudge_shown', {
            type: 'creation',
            remaining: updatedQuota.creations_remaining_today,
          });
          setShowLowQuotaNudge(true);
        }
      }
    } catch (error) {
      const rawMessage = error instanceof Error ? error.message : 'Something went wrong. Please try again.';
      const errorCode = (error as any)?.code;

      // Check if it's a quota exceeded error from the API
      if (errorCode === 'QUOTA_EXCEEDED' || rawMessage.includes('QUOTA_EXCEEDED')) {
        trackEvent('generate_blocked_no_quota', {
          error_source: 'api',
        });
        setIsAnalyzing(false);
        setShowBlockedModal(true);
      } else {
        setErrorMessage(transformErrorMessage(rawMessage));
      }
    } finally {
      setIsAnalyzing(false);
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

  const sampleListing: ListingData = {
    title: 'IKEA mid-century oak chair',
    price: '85',
    condition: 'Used - Good',
    location: 'Oslo, Norway',
    description: 'Beautiful vintage oak chair in excellent condition. Perfect for a dining room or home office. Minor wear consistent with age, but structurally sound and comfortable.',
    pickupAvailable: true,
    shippingAvailable: false,
    pickupNotes: '',
  };

  // Load quota
  const loadQuota = useCallback(async () => {
    if (!user) {
      setQuota(null);
      return null;
    }

    setQuotaLoading(true);
    try {
      const { quota: userQuota, error } = await checkQuota();
      if (error) {
        // Silently handle backend not configured or unavailable
        // Only show quota if we successfully got it
        setQuota(null);
        return null;
      } else if (userQuota) {
        setQuota(userQuota);
        // Show low quota nudge if creations <= 2
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
      // Silently handle errors - backend might not be set up yet
      setQuota(null);
      return null;
    } finally {
      setQuotaLoading(false);
    }
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      trackScreenView('home', { is_authenticated: !!user });
      loadQuota();
    }, [loadQuota, user]),
  );

  const sampleListingText = useMemo(
    () => formatListingText({ ...sampleListing, currency: '$' }),
    [],
  );

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <StatusBar barStyle="dark-content" />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Text style={styles.eyebrow}>SNAPSELL</Text>
          {user && quota && !quota.is_pro && (
            <QuotaCounterPill
              remaining={quota.creations_remaining_today}
              limit={quota.creations_daily_limit}
            />
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

          <View style={styles.ctaSection}>
            <Pressable
              accessibilityRole="button"
              onPress={handlePickImage}
              style={({ pressed }) => [
                styles.primaryButton,
                pressed && !isAnalyzing ? styles.primaryButtonPressed : null,
              ]}
              disabled={isAnalyzing}>
              <Text style={styles.primaryButtonText}>{ctaLabel}</Text>
            </Pressable>

            {errorMessage ? <Text style={styles.error}>{errorMessage}</Text> : null}
          </View>

          <View style={styles.samplePreviewCard}>
            <Text style={styles.samplePreviewLabel}>Sample listing:</Text>
            <Text style={styles.samplePreviewText}>{sampleListingText}</Text>
          </View>
        </View>
      </ScrollView>
      <SnappyLoading visible={isAnalyzing} />
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
  content: {
    padding: 24,
    paddingBottom: 48,
    gap: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
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
    paddingVertical: 16,
    borderRadius: 999,
    alignItems: 'center',
  },
  primaryButtonPressed: {
    opacity: 0.85,
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
  samplePreviewCard: {
    backgroundColor: '#EFF6FF',
    borderRadius: 14,
    padding: 18,
    marginTop: 8,
    alignSelf: 'stretch',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    shadowColor: '#93C5FD',
    shadowOpacity: 0.25,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  samplePreviewLabel: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '600',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  samplePreviewText: {
    fontSize: 15,
    color: '#1F2937',
    lineHeight: 22,
    fontFamily: Platform.select({
      ios: 'MarkerFelt-Wide',
      android: 'casual',
      default: 'Comic Sans MS',
    }),
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
