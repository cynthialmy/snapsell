import * as Clipboard from 'expo-clipboard';
import { Image } from 'expo-image';
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

import { SnappyLoading } from '@/components/snappy-loading';
import { analyzeItemPhoto, type ListingData } from '@/utils/api';
import { formatListingText } from '@/utils/listingFormatter';
import { deleteListing, loadListings, saveListing, type SavedListing } from '@/utils/listings';
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
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [previousListings, setPreviousListings] = useState<SavedListing[]>([]);
  const [copySuccessId, setCopySuccessId] = useState<string | null>(null);

  const ctaLabel = useMemo(
    () => (isAnalyzing ? 'Analyzing photo…' : 'Snap / Upload Item'),
    [isAnalyzing],
  );

  const processImage = async (asset: ImagePicker.ImagePickerAsset) => {
    setIsAnalyzing(true);
    setErrorMessage(null);

    try {
      const listing = await analyzeItemPhoto({
        uri: asset.uri,
        filename: asset.fileName ?? 'snapsell-item.jpg',
        mimeType: asset.mimeType ?? 'image/jpeg',
        onStatusChange: setErrorMessage,
      });

      navigateToPreview({ listing, imageUri: asset.uri });
    } catch (error) {
      const rawMessage = error instanceof Error ? error.message : 'Something went wrong. Please try again.';
      setErrorMessage(transformErrorMessage(rawMessage));
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

  const navigateToPreview = async (payload: { listing: ListingData; imageUri: string }) => {
    // Save listing to history
    try {
      const preferences = await loadPreferences();
      const currency = preferences?.currency || '$';
      await saveListing(payload.listing, currency, payload.imageUri);
    } catch (error) {
      // Don't block navigation if saving fails
      console.error('Failed to save listing:', error);
    }

    const params = encodeURIComponent(JSON.stringify(payload));
    router.push({
      pathname: '/listing-preview',
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

  // Load previous listings on mount and when screen comes into focus
  const loadPreviousListings = useCallback(async () => {
    const listings = await loadListings();
    setPreviousListings(listings);
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadPreviousListings();
    }, [loadPreviousListings]),
  );

  const sampleListingText = useMemo(
    () => formatListingText({ ...sampleListing, currency: '$' }),
    [],
  );

  const handleListingTap = async (savedListing: SavedListing) => {
    const listingText = formatListingText({
      ...savedListing.listing,
      currency: savedListing.currency,
    });
    await Clipboard.setStringAsync(listingText);
    setCopySuccessId(savedListing.id);
    setTimeout(() => setCopySuccessId(null), 2000);
  };

  const handleListingLongPress = (savedListing: SavedListing) => {
    // Navigate to preview with the saved listing
    const payload = {
      listing: savedListing.listing,
      imageUri: savedListing.imageUri,
    };
    const params = encodeURIComponent(JSON.stringify(payload));
    router.push({
      pathname: '/listing-preview',
      params: { payload: params },
    });
  };

  const handleDeleteListing = (savedListing: SavedListing) => {
    Alert.alert(
      'Delete listing',
      `Are you sure you want to delete "${savedListing.listing.title || 'this listing'}"?`,
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await deleteListing(savedListing.id);
            await loadPreviousListings();
          },
        },
      ],
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <StatusBar barStyle="dark-content" />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.eyebrow}>SNAPSELL</Text>
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

          {previousListings.length > 0 ? (
            <>
              <Text style={styles.previousListingsHeader}>Previous listings</Text>
              {previousListings.map(savedListing => {
                const listingText = formatListingText({
                  ...savedListing.listing,
                  currency: savedListing.currency,
                });
                const isCopied = copySuccessId === savedListing.id;
                return (
                  <Pressable
                    key={savedListing.id}
                    onPress={() => handleListingTap(savedListing)}
                    onLongPress={() => handleListingLongPress(savedListing)}
                    style={({ pressed }) => [
                      styles.listingCard,
                      pressed && styles.listingCardPressed,
                      isCopied && styles.listingCardCopied,
                    ]}>
                    {savedListing.imageUri ? (
                      <Image
                        source={{ uri: savedListing.imageUri }}
                        style={styles.listingCardImage}
                        contentFit="cover"
                        accessibilityLabel={savedListing.listing.title || 'Listing image'}
                      />
                    ) : null}
                    <View style={styles.listingCardHeader}>
                      <Text style={styles.listingCardTitle} numberOfLines={1}>
                        {savedListing.listing.title || 'Untitled listing'}
                      </Text>
                      <View style={styles.listingCardActions}>
                        {isCopied && <Text style={styles.copiedBadge}>Copied!</Text>}
                        <Pressable
                          onPress={() => handleDeleteListing(savedListing)}
                          style={({ pressed }) => [
                            styles.deleteButton,
                            pressed && styles.deleteButtonPressed,
                          ]}
                          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                          <Text style={styles.deleteButtonText}>🗑️</Text>
                        </Pressable>
                      </View>
                    </View>
                    <Text style={styles.listingCardText} numberOfLines={6}>
                      {listingText}
                    </Text>
                    <Text style={styles.listingCardHint}>
                      Tap to copy • Long press to edit
                    </Text>
                  </Pressable>
                );
              })}
            </>
          ) : (
            <View style={styles.samplePreviewCard}>
              <Text style={styles.samplePreviewLabel}>Sample listing:</Text>
              <Text style={styles.samplePreviewText}>{sampleListingText}</Text>
            </View>
          )}
        </View>
      </ScrollView>
      <SnappyLoading visible={isAnalyzing} />
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
  previousListingsHeader: {
    fontSize: 14,
    color: '#475569',
    fontWeight: '600',
    marginTop: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  listingCard: {
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
    overflow: 'hidden',
  },
  listingCardImage: {
    width: '100%',
    height: 200,
    borderRadius: 12,
    marginBottom: 12,
  },
  listingCardPressed: {
    opacity: 0.8,
    transform: [{ scale: 0.98 }],
  },
  listingCardCopied: {
    borderColor: '#16A34A',
    backgroundColor: '#F0FDF4',
  },
  listingCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  listingCardActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  deleteButton: {
    padding: 4,
    marginLeft: 8,
  },
  deleteButtonPressed: {
    opacity: 0.6,
  },
  deleteButtonText: {
    fontSize: 18,
  },
  listingCardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
    flex: 1,
  },
  copiedBadge: {
    fontSize: 12,
    color: '#16A34A',
    fontWeight: '600',
    marginLeft: 8,
  },
  listingCardText: {
    fontSize: 15,
    color: '#1F2937',
    lineHeight: 22,
    fontFamily: Platform.select({
      ios: 'MarkerFelt-Wide',
      android: 'casual',
      default: 'Comic Sans MS',
    }),
  },
  listingCardHint: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 8,
    fontStyle: 'italic',
  },
});
