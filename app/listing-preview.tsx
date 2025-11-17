import * as Clipboard from 'expo-clipboard';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { type ReactNode, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { ListingData } from '@/utils/api';
import { formatListingText } from '@/utils/listingFormatter';

type PreviewPayload = {
  listing: ListingData;
  imageUri: string;
};

export default function ListingPreviewScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ payload?: string }>();

  const payload = useMemo<PreviewPayload | null>(() => {
    if (!params.payload) return null;
    try {
      return JSON.parse(decodeURIComponent(params.payload));
    } catch {
      return null;
    }
  }, [params.payload]);

  const [title, setTitle] = useState(payload?.listing.title ?? '');
  const [price, setPrice] = useState(payload?.listing.price ?? '');
  const [description, setDescription] = useState(payload?.listing.description ?? '');
  const [condition, setCondition] = useState(payload?.listing.condition ?? '');
  const [location, setLocation] = useState(payload?.listing.location ?? '');
  const [copySuccess, setCopySuccess] = useState(false);

  useEffect(() => {
    if (!payload) {
      Alert.alert('Upload required', 'Please add an item before opening the preview.', [
        { text: 'OK', onPress: () => router.replace('/') },
      ]);
    }
  }, [payload, router]);

  if (!payload) {
    return null;
  }

  const handleCopy = async () => {
    const text = formatListingText({ title, price, description, condition, location });
    await Clipboard.setStringAsync(text);
    setCopySuccess(true);
  };

  const handleReset = () => {
    setCopySuccess(false);
    router.replace('/');
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.root}>
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.eyebrow}>Listing preview</Text>
          <Text style={styles.header}>Tweak anything, then copy the finished block.</Text>

          <Image
            source={{ uri: payload.imageUri }}
            style={styles.photo}
            contentFit="cover"
            accessibilityLabel="Uploaded item"
          />

          <View style={styles.form}>
            <Field label="Title">
              <TextInput
                value={title}
                onChangeText={text => {
                  setTitle(text);
                  setCopySuccess(false);
                }}
                style={styles.input}
                placeholder="e.g. Mid-century oak chair"
              />
            </Field>

            <View style={styles.row}>
              <Field label="Price (numbers only)" style={styles.flex}>
                <TextInput
                  value={price}
                  onChangeText={text => {
                    setPrice(text);
                    setCopySuccess(false);
                  }}
                  style={styles.input}
                  placeholder="120"
                  keyboardType="numeric"
                />
              </Field>
              <Field label="Condition" style={styles.flex}>
                <TextInput
                  value={condition}
                  onChangeText={text => {
                    setCondition(text);
                    setCopySuccess(false);
                  }}
                  style={styles.input}
                  placeholder="Used - Good"
                />
              </Field>
            </View>

            <Field label="Location (optional)">
              <TextInput
                value={location}
                onChangeText={text => {
                  setLocation(text);
                  setCopySuccess(false);
                }}
                style={styles.input}
                placeholder="Oslo, Norway"
              />
            </Field>

            <Field label="Description">
              <TextInput
                value={description}
                onChangeText={text => {
                  setDescription(text);
                  setCopySuccess(false);
                }}
                style={[styles.input, styles.textArea]}
                placeholder="Add measurements, wear-and-tear, pickup details…"
                multiline
                numberOfLines={5}
              />
            </Field>
          </View>

          <Pressable
            onPress={handleCopy}
            style={({ pressed }) => [styles.copyButton, pressed ? styles.copyButtonPressed : null]}>
            <Text style={styles.copyButtonText}>Copy listing text</Text>
          </Pressable>

          {copySuccess ? (
            <Text style={styles.success}>Copied! Paste it into your marketplace.</Text>
          ) : null}

          <Pressable
            onPress={handleReset}
            style={({ pressed }) => [styles.secondaryButton, pressed ? styles.secondaryButtonPressed : null]}>
            <Text style={styles.secondaryButtonText}>Add next item</Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

type FieldProps = {
  label: string;
  children: ReactNode;
  style?: object;
};

function Field({ label, children, style }: FieldProps) {
  return (
    <View style={[styles.field, style]}>
      <Text style={styles.label}>{label}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  root: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  content: {
    padding: 24,
    paddingBottom: 48,
    gap: 16,
  },
  eyebrow: {
    fontSize: 12,
    letterSpacing: 1.2,
    color: '#64748B',
    textTransform: 'uppercase',
    fontWeight: '600',
  },
  header: {
    fontSize: 24,
    fontWeight: '700',
    color: '#0F172A',
    lineHeight: 30,
  },
  photo: {
    width: '100%',
    height: 260,
    borderRadius: 16,
  },
  form: {
    gap: 16,
  },
  field: {
    gap: 8,
  },
  label: {
    fontSize: 14,
    color: '#475569',
    fontWeight: '600',
  },
  input: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: '#0F172A',
    backgroundColor: '#F8FAFC',
  },
  textArea: {
    minHeight: 120,
    textAlignVertical: 'top',
  },
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  flex: {
    flex: 1,
  },
  copyButton: {
    backgroundColor: '#0F172A',
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
  },
  copyButtonPressed: {
    opacity: 0.85,
  },
  copyButtonText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 16,
  },
  success: {
    color: '#16A34A',
    fontSize: 14,
  },
  secondaryButton: {
    borderWidth: 1,
    borderColor: '#CBD5F5',
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
  },
  secondaryButtonPressed: {
    backgroundColor: '#EEF2FF',
  },
  secondaryButtonText: {
    color: '#312E81',
    fontWeight: '600',
  },
});
