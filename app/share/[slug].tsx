import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
    Image,
    ScrollView,
    StyleSheet,
    Text,
    View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { trackEvent, trackScreenView } from '@/utils/analytics';
import { formatListingText } from '@/utils/listingFormatter';
import { getListingBySlug } from '@/utils/listings-api';

interface Listing {
  id: string;
  title: string;
  description: string;
  price_cents: number;
  currency: string;
  condition?: string;
  image_url?: string;
  storage_path?: string;
  share_slug?: string;
}

export default function SharedListingScreen() {
  const params = useLocalSearchParams<{ slug: string }>();
  const [listing, setListing] = useState<Listing | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (params.slug) {
        trackScreenView('share', { slug: params.slug });
      }
    }, [params.slug])
  );

  useEffect(() => {
    if (params.slug) {
      loadListing(params.slug);
    }
  }, [params.slug]);

  const loadListing = async (slug: string) => {
    setLoading(true);
    setError(null);

    const { listing: fetchedListing, error: fetchError } = await getListingBySlug(slug);

    if (fetchError) {
      setError(fetchError.message || 'Listing not found');
      setLoading(false);
      return;
    }

    if (fetchedListing) {
      setListing(fetchedListing);
      trackEvent('share_link_viewed', {
        slug,
        listing_id: fetchedListing.id,
      });
    } else {
      setError('Listing not found');
    }

    setLoading(false);
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Loading listing...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error || !listing) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{error || 'Listing not found'}</Text>
        </View>
      </SafeAreaView>
    );
  }

  const listingText = formatListingText({
    title: listing.title,
    price: (listing.price_cents / 100).toString(),
    description: listing.description,
    condition: listing.condition || '',
    location: '',
    currency: listing.currency || '$',
  });

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
        {listing.image_url && (
          <Image
            source={{ uri: listing.image_url }}
            style={styles.image}
            contentFit="cover"
          />
        )}

        <View style={styles.details}>
          <Text style={styles.title}>{listing.title || 'Untitled listing'}</Text>

          {listing.condition && (
            <Text style={styles.condition}>{listing.condition}</Text>
          )}

          <View style={styles.priceContainer}>
            <Text style={styles.price}>
              {listing.currency || '$'}{(listing.price_cents / 100).toFixed(2)}
            </Text>
          </View>

          <Text style={styles.description}>{listing.description}</Text>

          <View style={styles.listingPreview}>
            <Text style={styles.listingPreviewTitle}>Listing Preview</Text>
            <Text style={styles.listingPreviewText}>{listingText}</Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  scrollView: {
    flex: 1,
  },
  content: {
    paddingBottom: 48,
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
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  errorText: {
    fontSize: 16,
    color: '#DC2626',
    textAlign: 'center',
  },
  image: {
    width: '100%',
    height: 300,
  },
  details: {
    padding: 24,
    gap: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#0F172A',
  },
  condition: {
    fontSize: 16,
    color: '#64748B',
  },
  priceContainer: {
    marginTop: 8,
  },
  price: {
    fontSize: 32,
    fontWeight: '700',
    color: '#0F172A',
  },
  description: {
    fontSize: 16,
    color: '#475569',
    lineHeight: 24,
    marginTop: 8,
  },
  listingPreview: {
    marginTop: 24,
    backgroundColor: '#EFF6FF',
    borderRadius: 14,
    padding: 20,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  listingPreviewTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0369A1',
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  listingPreviewText: {
    fontSize: 14,
    color: '#1F2937',
    lineHeight: 20,
  },
});
