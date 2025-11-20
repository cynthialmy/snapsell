import AsyncStorage from '@react-native-async-storage/async-storage';

import type { ListingData } from './api';

const LISTINGS_KEY = '@snapsell:listings';
const MAX_LISTINGS = 50; // Limit to prevent storage bloat

export type SavedListing = {
  id: string;
  listing: ListingData;
  currency: string;
  imageUri: string;
  createdAt: number; // Timestamp
};

export async function saveListing(
  listing: ListingData,
  currency: string = '$',
  imageUri: string = '',
): Promise<void> {
  try {
    const existingListings = await loadListings();
    const newListing: SavedListing = {
      id: Date.now().toString(),
      listing,
      currency,
      imageUri,
      createdAt: Date.now(),
    };

    // Add new listing at the beginning and limit total count
    const updatedListings = [newListing, ...existingListings].slice(0, MAX_LISTINGS);
    await AsyncStorage.setItem(LISTINGS_KEY, JSON.stringify(updatedListings));
  } catch (error) {
    console.error('Failed to save listing:', error);
  }
}

export async function loadListings(): Promise<SavedListing[]> {
  try {
    const data = await AsyncStorage.getItem(LISTINGS_KEY);
    if (data) {
      const listings = JSON.parse(data) as SavedListing[];
      // Sort by most recent first (should already be sorted, but ensure it)
      return listings.sort((a, b) => b.createdAt - a.createdAt);
    }
    return [];
  } catch (error) {
    console.error('Failed to load listings:', error);
    return [];
  }
}

export async function deleteListing(id: string): Promise<void> {
  try {
    const listings = await loadListings();
    const updatedListings = listings.filter(listing => listing.id !== id);
    await AsyncStorage.setItem(LISTINGS_KEY, JSON.stringify(updatedListings));
  } catch (error) {
    console.error('Failed to delete listing:', error);
  }
}

export async function clearListings(): Promise<void> {
  try {
    await AsyncStorage.removeItem(LISTINGS_KEY);
  } catch (error) {
    console.error('Failed to clear listings:', error);
  }
}
