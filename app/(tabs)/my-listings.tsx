import * as Clipboard from 'expo-clipboard';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import {
    Alert,
    Image,
    Pressable,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/contexts/AuthContext';
import { trackEvent, trackScreenView } from '@/utils/analytics';
import { formatListingText } from '@/utils/listingFormatter';
import { deleteListing as deleteListingApi, getMyListings } from '@/utils/listings-api';

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
            <Text style={styles.emptyText}>No listings yet</Text>
            <Text style={styles.emptySubtext}>Create your first listing from the home screen</Text>
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
                      contentFit="cover"
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
});
