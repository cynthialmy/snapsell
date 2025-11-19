import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
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

import { analyzeItemPhoto, type ListingData } from '@/utils/api';
import { formatListingText } from '@/utils/listingFormatter';

export default function HomeScreen() {
  const router = useRouter();
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [lastImageUri, setLastImageUri] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const ctaLabel = useMemo(
    () => (isAnalyzing ? 'Analyzing photo…' : 'Snap / Upload Item'),
    [isAnalyzing],
  );

  const processImage = async (asset: ImagePicker.ImagePickerAsset) => {
    setLastImageUri(asset.uri);
    setIsAnalyzing(true);

    try {
      const listing = await analyzeItemPhoto({
        uri: asset.uri,
        filename: asset.fileName ?? 'snapsell-item.jpg',
        mimeType: asset.mimeType ?? 'image/jpeg',
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
    title: 'Mid-century oak chair',
    brand: 'IKEA',
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

        {lastImageUri ? (
          <View style={styles.previewCard}>
            <Image source={{ uri: lastImageUri }} contentFit="cover" style={styles.previewImage} />
            <Text style={styles.previewHint}>
              Preview of your last upload. Snap another item anytime.
            </Text>
          </View>
        ) : null}

        <View style={styles.steps}>
          <Text style={styles.stepsTitle}>How it works</Text>
          {['Snap / upload photo', 'AI drafts the listing', 'Copy & paste anywhere'].map(
            (step, idx) => (
              <View key={step}>
                <View style={styles.stepItem}>
                  <Text style={styles.stepNumber}>{idx + 1}</Text>
                  <Text style={styles.stepLabel}>{step}</Text>
                </View>
                {idx === 1 && (
                  <View style={styles.samplePreviewCard}>
                    <Text style={styles.samplePreviewLabel}>Sample listing:</Text>
                    <Text style={styles.samplePreviewText}>{sampleListingText}</Text>
                  </View>
                )}
              </View>
            ),
          )}
        </View>
      </ScrollView>
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
  previewCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    shadowColor: '#0F172A',
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
    gap: 12,
  },
  previewImage: {
    width: '100%',
    height: 220,
    borderRadius: 12,
  },
  previewHint: {
    color: '#64748B',
    fontSize: 13,
  },
  steps: {
    marginTop: 8,
    gap: 12,
  },
  stepsTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#0F172A',
  },
  stepItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 14,
  },
  stepNumber: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#EEF2FF',
    color: '#4338CA',
    textAlign: 'center',
    fontWeight: '700',
    lineHeight: 28,
  },
  stepLabel: {
    fontSize: 15,
    color: '#0F172A',
    fontWeight: '500',
  },
  samplePreviewCard: {
    backgroundColor: '#F8F9FA',
    borderRadius: 12,
    padding: 16,
    marginTop: 8,
    marginLeft: 40,
    borderWidth: 1,
    borderColor: '#E5E7EB',
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
    fontSize: 14,
    color: '#0F172A',
    lineHeight: 20,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
});
