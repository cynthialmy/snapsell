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

export default function HomeScreen() {
  const router = useRouter();
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [lastImageUri, setLastImageUri] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const ctaLabel = useMemo(
    () => (isAnalyzing ? 'Analyzing photo…' : 'Snap / Upload Item'),
    [isAnalyzing],
  );

  const handlePickImage = async () => {
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
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.9,
    });

    if (result.canceled) {
      return;
    }

    const asset = result.assets[0];
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

  const navigateToPreview = (payload: { listing: ListingData; imageUri: string }) => {
    const params = encodeURIComponent(JSON.stringify(payload));
    router.push({
      pathname: '/listing-preview',
      params: { payload: params },
    });
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <StatusBar barStyle="dark-content" />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.eyebrow}>SNAPSELL</Text>
        <Text style={styles.title}>Turn a single photo into a ready-to-post listing.</Text>
        <Text style={styles.subtitle}>
          Upload once. SnapSell writes the title, pricing guess, and selling copy for Facebook
          Marketplace, Tise, Blocket, and more.
        </Text>

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
              <View key={step} style={styles.stepItem}>
                <Text style={styles.stepNumber}>{idx + 1}</Text>
                <Text style={styles.stepLabel}>{step}</Text>
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
});
