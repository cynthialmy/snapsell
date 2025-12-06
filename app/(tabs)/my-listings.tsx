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
      loadListings();
    }, [loadListings])
  );

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    loadListings();
  }, [loadListings]);

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
              loadListings();
            }
          },
        },
      ]
    );
  };

  const handleListingPress = (listing: Listing) => {
    // Navigate to preview/edit screen
    // We'll need to adapt this to work with the new backend structure
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
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>Please sign in to view your listings</Text>
        </View>
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

              return (
                <Pressable
                  key={listing.id}
                  onPress={() => handleListingPress(listing)}
                  style={({ pressed }) => [
                    styles.listingCard,
                    pressed && styles.listingCardPressed,
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
                      <Pressable
                        onPress={() => handleDeleteListing(listing)}
                        style={styles.deleteButton}>
                        <Text style={styles.deleteButtonText}>🗑️</Text>
                      </Pressable>
                    </View>
                    <Text style={styles.listingText} numberOfLines={3}>
                      {listingText}
                    </Text>
                    <Text style={styles.listingDate}>
                      {new Date(listing.created_at).toLocaleDateString()}
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
  },
});
