import { Image } from 'expo-image';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming
} from 'react-native-reanimated';

type AnimatedSplashProps = {
  onAnimationComplete: () => void;
  imageSource: any;
  backgroundColor?: string;
  duration?: number; // Duration in milliseconds to show the animation
};

export function AnimatedSplash({
  onAnimationComplete,
  imageSource,
  backgroundColor = '#ffffff',
  duration = 2000, // Default 2 seconds
}: AnimatedSplashProps) {
  const [isVisible, setIsVisible] = useState(true);
  const [imageError, setImageError] = useState(false);
  const opacity = useSharedValue(0);
  const scale = useSharedValue(0.8);
  const onCompleteRef = useRef(onAnimationComplete);
  const hasCompletedRef = useRef(false);

  // Update ref when callback changes, but don't re-run effect
  useEffect(() => {
    onCompleteRef.current = onAnimationComplete;
  }, [onAnimationComplete]);

  useEffect(() => {
    // Reset completion flag
    hasCompletedRef.current = false;

    // Fade in and scale up
    opacity.value = withTiming(1, { duration: 300 });
    scale.value = withTiming(1, { duration: 300 });

    // After the specified duration, fade out and call completion
    const timer = setTimeout(() => {
      opacity.value = withTiming(0, { duration: 300 });
      scale.value = withTiming(0.9, { duration: 300 });

      setTimeout(() => {
        if (!hasCompletedRef.current) {
          hasCompletedRef.current = true;
          setIsVisible(false);
          onCompleteRef.current();
        }
      }, 300);
    }, duration);

    // Safety timeout: ensure we always dismiss after duration + fade time + buffer
    const safetyTimer = setTimeout(() => {
      if (!hasCompletedRef.current && isVisible) {
        hasCompletedRef.current = true;
        setIsVisible(false);
        onCompleteRef.current();
      }
    }, duration + 1000); // Add 1 second buffer

    return () => {
      clearTimeout(timer);
      clearTimeout(safetyTimer);
    };
  }, [duration, opacity, scale, isVisible]); // Removed onAnimationComplete from dependencies

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }));

  if (!isVisible) {
    return null;
  }

  return (
    <View style={[styles.container, { backgroundColor }]} pointerEvents="none">
      <Animated.View style={[styles.imageContainer, animatedStyle]}>
        <Image
          source={imageSource}
          style={styles.image}
          contentFit="contain"
          transition={200}
        />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 9999,
    // Ensure this doesn't block rendering
    elevation: 0, // Android
  },
  imageContainer: {
    width: 200,
    height: 200,
    justifyContent: 'center',
    alignItems: 'center',
  },
  image: {
    width: '100%',
    height: '100%',
  },
});
