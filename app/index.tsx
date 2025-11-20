git aimport * as ImagePicker from 'expo-image-picker';
import * as MediaLibrary from 'expo-media-library';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
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

export default function HomeScreen() {
  const router = useRouter();
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

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
      setErrorMessage(
        error instanceof Error ? error.message : 'Something went wrong. Please try again.',
      );
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

  const navigateToPreview = (payload: { listing: ListingData; imageUri: string }) => {
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

  const sampleListingText = useMemo(
    () => formatListingText({ ...sampleListing, currency: '$' }),
    [],
  );

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
          <View style={styles.samplePreviewCard}>
            <Text style={styles.samplePreviewLabel}>Sample listing:</Text>
            <Text style={styles.samplePreviewText}>{sampleListingText}</Text>
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
    color: '#DC2626',
    fontSize: 14,
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
});
