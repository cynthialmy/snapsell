import AsyncStorage from '@react-native-async-storage/async-storage';

const PREFERENCES_KEY = '@snapsell:preferences';

export type UserPreferences = {
  location?: string;
  pickupAvailable?: boolean;
  shippingAvailable?: boolean;
  pickupNotes?: string;
  currency?: string;
};

export async function savePreferences(preferences: UserPreferences): Promise<void> {
  try {
    await AsyncStorage.setItem(PREFERENCES_KEY, JSON.stringify(preferences));
  } catch (error) {
    console.error('Failed to save preferences:', error);
  }
}

export async function loadPreferences(): Promise<UserPreferences | null> {
  try {
    const data = await AsyncStorage.getItem(PREFERENCES_KEY);
    if (data) {
      return JSON.parse(data) as UserPreferences;
    }
    return null;
  } catch (error) {
    console.error('Failed to load preferences:', error);
    return null;
  }
}

export async function clearPreferences(): Promise<void> {
  try {
    await AsyncStorage.removeItem(PREFERENCES_KEY);
  } catch (error) {
    console.error('Failed to clear preferences:', error);
  }
}
