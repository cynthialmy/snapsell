import { Image } from 'expo-image';
import React, { useEffect, useState } from 'react';
import { AccessibilityInfo, Modal, StyleSheet, Text, View } from 'react-native';
import Animated, {
    Easing,
    useAnimatedStyle,
    useSharedValue,
    withRepeat,
    withSequence,
    withSpring,
    withTiming,
} from 'react-native-reanimated';

interface SnappyCelebrationProps {
  visible: boolean;
  creationsAdded?: number;
  savesAdded?: number;
  onComplete?: () => void;
}

export function SnappyCelebration({
  visible,
  creationsAdded = 25,
  savesAdded = 25,
  onComplete,
}: SnappyCelebrationProps) {
  const [reduceMotion, setReduceMotion] = useState(false);
  const scale = useSharedValue(0);
  const rotation = useSharedValue(0);
  const translateY = useSharedValue(0);
  const opacity = useSharedValue(0);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion);
  }, []);

  useEffect(() => {
    if (visible) {
      // Entrance animation
      scale.value = withSpring(1, { damping: 10, stiffness: 100 });
      translateY.value = withSequence(
        withTiming(-20, { duration: 300, easing: Easing.out(Easing.ease) }),
        withSpring(0, { damping: 8, stiffness: 100 })
      );
      opacity.value = withTiming(1, { duration: 300 });

      // Jump animation (repeat a few times)
      if (!reduceMotion) {
        rotation.value = withRepeat(
          withSequence(
            withTiming(-10, { duration: 150 }),
            withTiming(10, { duration: 150 }),
            withTiming(-10, { duration: 150 }),
            withTiming(0, { duration: 150 })
          ),
          2,
          false
        );

        // Jump up and down
        translateY.value = withRepeat(
          withSequence(
            withTiming(-15, { duration: 200, easing: Easing.out(Easing.ease) }),
            withTiming(0, { duration: 200, easing: Easing.in(Easing.ease) })
          ),
          3,
          false
        );
      }

      // Auto-dismiss after 3 seconds
      const timer = setTimeout(() => {
        opacity.value = withTiming(0, { duration: 300 }, () => {
          onComplete?.();
        });
      }, 3000);

      return () => clearTimeout(timer);
    } else {
      // Reset animations
      scale.value = 0;
      rotation.value = 0;
      translateY.value = 0;
      opacity.value = 0;
    }
  }, [visible, reduceMotion, scale, rotation, translateY, opacity, onComplete]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: scale.value },
      { rotate: `${rotation.value}deg` },
      { translateY: translateY.value },
    ],
    opacity: opacity.value,
  }));

  const containerAnimatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  if (!visible) {
    return null;
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={onComplete}>
      <Animated.View style={[styles.overlay, containerAnimatedStyle]}>
        <View style={styles.container}>
          <Animated.View style={animatedStyle}>
            <Image
              source={require('@/assets/images/Snappy_Wave_Animation.png')}
              style={styles.snappyImage}
              contentFit="contain"
            />
          </Animated.View>
          <Text style={styles.message}>
            🎉 Nice! You now have +{creationsAdded} creations & +{savesAdded} saves.
          </Text>
        </View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  container: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 32,
    alignItems: 'center',
    gap: 20,
    minWidth: 280,
    shadowColor: '#0F172A',
    shadowOpacity: 0.2,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  snappyImage: {
    width: 60,
    height: 60,
  },
  message: {
    fontSize: 16,
    color: '#0F172A',
    fontWeight: '600',
    textAlign: 'center',
  },
});
