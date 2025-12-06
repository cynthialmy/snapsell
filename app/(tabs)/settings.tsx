import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/contexts/AuthContext';
import { signOut } from '@/utils/auth';
import { checkQuota } from '@/utils/listings-api';
import { loadPreferences, savePreferences, type UserPreferences } from '@/utils/preferences';

const CURRENCY_OPTIONS = ['$', '€', '£', 'kr', '¥'];

interface Quota {
  used: number;
  limit: number;
  remaining: number;
}

export default function SettingsScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [quota, setQuota] = useState<Quota | null>(null);
  const [quotaLoading, setQuotaLoading] = useState(true);
  const [location, setLocation] = useState('');
  const [currency, setCurrency] = useState('$');
  const [pickupAvailable, setPickupAvailable] = useState(false);
  const [shippingAvailable, setShippingAvailable] = useState(false);
  const [pickupNotes, setPickupNotes] = useState('');
  const [showCurrencyDropdown, setShowCurrencyDropdown] = useState(false);

  useEffect(() => {
    loadUserPreferences();
    loadQuota();
  }, [user]);

  const loadUserPreferences = async () => {
    const prefs = await loadPreferences();
    if (prefs) {
      setLocation(prefs.location || '');
      setCurrency(prefs.currency || '$');
      setPickupAvailable(prefs.pickupAvailable ?? false);
      setShippingAvailable(prefs.shippingAvailable ?? false);
      setPickupNotes(prefs.pickupNotes || '');
    }
  };

  const loadQuota = async () => {
    if (!user) {
      setQuotaLoading(false);
      return;
    }

    try {
      const { quota: userQuota, error } = await checkQuota();
      if (error) {
        // Silently handle backend not configured or unavailable
        setQuota(null);
      } else if (userQuota) {
        setQuota(userQuota);
      }
    } catch (error) {
      // Silently handle errors - backend might not be set up yet
      setQuota(null);
    } finally {
      setQuotaLoading(false);
    }
  };

  const saveUserPreferences = async () => {
    const prefs: UserPreferences = {
      location,
      currency,
      pickupAvailable,
      shippingAvailable,
      pickupNotes,
    };
    await savePreferences(prefs);
  };

  useEffect(() => {
    // Debounce save
    const timer = setTimeout(() => {
      saveUserPreferences();
    }, 500);
    return () => clearTimeout(timer);
  }, [location, currency, pickupAvailable, shippingAvailable, pickupNotes]);

  const handleSignOut = async () => {
    Alert.alert(
      'Sign out',
      'Are you sure you want to sign out?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign out',
          style: 'destructive',
          onPress: async () => {
            await signOut();
            router.replace('/(auth)/sign-in');
          },
        },
      ]
    );
  };

  const handleUpgrade = () => {
    router.push('/(tabs)/upgrade');
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.content}
        onScrollBeginDrag={() => {
          if (showCurrencyDropdown) {
            setShowCurrencyDropdown(false);
          }
        }}>
        <Text style={styles.title}>Settings</Text>

        {user && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Account</Text>
            <Pressable
              onPress={() => router.push('/(auth)/profile')}
              style={styles.sectionButton}>
              <Text style={styles.sectionButtonText}>Profile</Text>
              <Text style={styles.sectionButtonArrow}>→</Text>
            </Pressable>
          </View>
        )}

        {user && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Usage & Quota</Text>
            {quotaLoading ? (
              <Text style={styles.quotaText}>Loading...</Text>
            ) : quota ? (
              <View style={styles.quotaContainer}>
                <Text style={styles.quotaText}>
                  {quota.used} / {quota.limit} listings used
                </Text>
                <Text style={styles.quotaSubtext}>
                  {quota.remaining} remaining
                </Text>
                {quota.remaining === 0 && (
                  <Pressable onPress={handleUpgrade} style={styles.upgradeButton}>
                    <Text style={styles.upgradeButtonText}>Upgrade to get more</Text>
                  </Pressable>
                )}
              </View>
            ) : (
              <Text style={styles.quotaText}>Unable to load quota</Text>
            )}
          </View>
        )}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Preferences</Text>

          <View style={styles.preferenceField}>
            <Text style={styles.preferenceLabel}>Default Location</Text>
            <TextInput
              value={location}
              onChangeText={setLocation}
              placeholder="e.g. Oslo, Norway"
              style={styles.preferenceInput}
            />
          </View>

          <View style={styles.preferenceField}>
            <Text style={styles.preferenceLabel}>Currency</Text>
            <View style={styles.dropdownContainer}>
              <Pressable
                onPress={() => setShowCurrencyDropdown(!showCurrencyDropdown)}
                style={styles.currencyButton}>
                <Text style={styles.currencyButtonText}>{currency}</Text>
                <Text style={styles.currencyButtonArrow}>{showCurrencyDropdown ? '▲' : '▼'}</Text>
              </Pressable>
              {showCurrencyDropdown && (
                <View style={styles.dropdown}>
                  <ScrollView
                    style={styles.dropdownScroll}
                    nestedScrollEnabled
                    showsVerticalScrollIndicator>
                    {CURRENCY_OPTIONS.map(option => (
                      <TouchableOpacity
                        key={option}
                        onPress={() => {
                          setCurrency(option);
                          setShowCurrencyDropdown(false);
                        }}
                        style={[
                          styles.dropdownOption,
                          currency === option && styles.dropdownOptionSelected,
                        ]}>
                        <Text
                          style={[
                            styles.dropdownOptionText,
                            currency === option && styles.dropdownOptionTextSelected,
                          ]}>
                          {option}
                        </Text>
                        {currency === option && <Text style={styles.dropdownOptionCheck}>✓</Text>}
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              )}
            </View>
          </View>

          <View style={styles.preferenceRow}>
            <Text style={styles.preferenceLabel}>Pickup Available (default)</Text>
            <Switch value={pickupAvailable} onValueChange={setPickupAvailable} />
          </View>

          <View style={styles.preferenceRow}>
            <Text style={styles.preferenceLabel}>Shipping Available (default)</Text>
            <Switch value={shippingAvailable} onValueChange={setShippingAvailable} />
          </View>

          {pickupAvailable && (
            <View style={styles.preferenceField}>
              <Text style={styles.preferenceLabel}>Pickup Notes (default)</Text>
              <TextInput
                value={pickupNotes}
                onChangeText={setPickupNotes}
                placeholder="e.g. Evenings only"
                multiline
                style={[styles.preferenceInput, styles.preferenceTextArea]}
              />
            </View>
          )}
        </View>

        {user && (
          <View style={styles.signOutSection}>
            <Pressable onPress={handleSignOut} style={styles.signOutButton}>
              <Text style={styles.signOutButtonText}>Sign out</Text>
            </Pressable>
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
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 32,
  },
  section: {
    marginBottom: 32,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#475569',
    marginBottom: 16,
  },
  sectionButton: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
  },
  sectionButtonText: {
    fontSize: 16,
    color: '#0F172A',
  },
  sectionButtonArrow: {
    fontSize: 16,
    color: '#64748B',
  },
  quotaContainer: {
    gap: 8,
  },
  quotaText: {
    fontSize: 16,
    color: '#0F172A',
    fontWeight: '600',
  },
  quotaSubtext: {
    fontSize: 14,
    color: '#64748B',
  },
  upgradeButton: {
    backgroundColor: '#4338CA',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    marginTop: 8,
    alignItems: 'center',
  },
  upgradeButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  preferenceField: {
    marginBottom: 16,
  },
  preferenceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  preferenceLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#475569',
    marginBottom: 8,
  },
  preferenceInput: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    color: '#0F172A',
    backgroundColor: '#F8FAFC',
  },
  preferenceTextArea: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  dropdownContainer: {
    position: 'relative',
    zIndex: 1000,
  },
  dropdown: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    marginTop: 4,
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 8,
    maxHeight: 250,
    overflow: 'hidden',
    zIndex: 1001,
  },
  dropdownScroll: {
    maxHeight: 250,
  },
  dropdownOption: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  dropdownOptionSelected: {
    backgroundColor: '#EEF2FF',
  },
  dropdownOptionText: {
    fontSize: 16,
    color: '#0F172A',
    flex: 1,
  },
  dropdownOptionTextSelected: {
    fontWeight: '600',
    color: '#4338CA',
  },
  dropdownOptionCheck: {
    fontSize: 16,
    color: '#4338CA',
    marginLeft: 8,
    fontWeight: '700',
  },
  currencyButton: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#F8FAFC',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
  },
  currencyButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#0F172A',
  },
  currencyButtonArrow: {
    fontSize: 12,
    color: '#64748B',
  },
  signOutSection: {
    marginTop: 32,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    paddingTop: 16,
  },
  signOutButton: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  signOutButtonText: {
    fontSize: 16,
    color: '#DC2626',
    fontWeight: '600',
  },
});
