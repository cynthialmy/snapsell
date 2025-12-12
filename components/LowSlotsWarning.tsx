import React, { useEffect } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';

interface LowSlotsWarningProps {
  visible: boolean;
  remaining: number;
  onDismiss: () => void;
  onUpgrade?: () => void;
}

export function LowSlotsWarning({
  visible,
  remaining,
  onDismiss,
  onUpgrade,
}: LowSlotsWarningProps) {
  const fadeAnim = React.useRef(new Animated.Value(0)).current;
  const slideAnim = React.useRef(new Animated.Value(50)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.spring(slideAnim, {
          toValue: 0,
          tension: 50,
          friction: 7,
          useNativeDriver: true,
        }),
      ]).start();

      // Auto-dismiss after 5 seconds
      const timer = setTimeout(() => {
        handleDismiss();
      }, 5000);

      return () => clearTimeout(timer);
    } else {
      fadeAnim.setValue(0);
      slideAnim.setValue(50);
    }
  }, [visible]);

  const handleDismiss = () => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 50,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start(() => {
      onDismiss();
    });
  };

  if (!visible) {
    return null;
  }

  return (
    <Animated.View
      style={[
        styles.container,
        {
          opacity: fadeAnim,
          transform: [{ translateY: slideAnim }],
        },
      ]}>
      <View style={styles.content}>
        <Text style={styles.emoji}>🔥</Text>
        <View style={styles.textContainer}>
          <Text style={styles.text}>
            Only {remaining} Save Slot{remaining !== 1 ? 's' : ''} left — you're on fire!
          </Text>
          {onUpgrade && (
            <Pressable onPress={onUpgrade} style={styles.upgradeLink}>
              <Text style={styles.upgradeLinkText}>Upgrade anytime for unlimited saves</Text>
            </Pressable>
          )}
        </View>
        <Pressable onPress={handleDismiss} style={styles.dismissButton}>
          <Text style={styles.dismissButtonText}>✕</Text>
        </Pressable>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 100,
    left: 16,
    right: 16,
    zIndex: 1000,
  },
  content: {
    backgroundColor: '#FEF3C7',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#FDE68A',
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  emoji: {
    fontSize: 24,
    marginRight: 12,
  },
  textContainer: {
    flex: 1,
  },
  text: {
    fontSize: 14,
    color: '#92400E',
    fontWeight: '600',
    marginBottom: 4,
  },
  upgradeLink: {
    marginTop: 2,
  },
  upgradeLinkText: {
    fontSize: 12,
    color: '#B45309',
    textDecorationLine: 'underline',
  },
  dismissButton: {
    padding: 4,
    marginLeft: 8,
  },
  dismissButtonText: {
    fontSize: 18,
    color: '#92400E',
    fontWeight: '600',
  },
});
