import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { Modal, StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

const MESSAGES = [
  'Snappy is checking the photo...',
  'Preparing the description...',
  'Analyzing details...',
  'Almost done...',
];

const MESSAGE_INTERVAL = 2500; // Change message every 2.5 seconds

type SnappyLoadingProps = {
  visible: boolean;
};

export function SnappyLoading({ visible }: SnappyLoadingProps) {
  const [currentMessageIndex, setCurrentMessageIndex] = useState(0);
  const opacity = useSharedValue(1);
  const containerOpacity = useSharedValue(0);

  // Fade in/out the container
  useEffect(() => {
    if (visible) {
      containerOpacity.value = withTiming(1, { duration: 300 });
    } else {
      containerOpacity.value = withTiming(0, { duration: 200 });
    }
  }, [visible, containerOpacity]);

  // Cycle through messages
  useEffect(() => {
    if (!visible) {
      setCurrentMessageIndex(0);
      return;
    }

    const interval = setInterval(() => {
      setCurrentMessageIndex(prev => (prev + 1) % MESSAGES.length);
    }, MESSAGE_INTERVAL);

    return () => clearInterval(interval);
  }, [visible]);

  // Fade animation for message transitions
  useEffect(() => {
    if (visible) {
      opacity.value = withSequence(
        withTiming(0.3, { duration: 200 }),
        withTiming(1, { duration: 200 })
      );
    }
  }, [currentMessageIndex, visible, opacity]);

  const containerAnimatedStyle = useAnimatedStyle(() => ({
    opacity: containerOpacity.value,
  }));

  const messageAnimatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  if (!visible) {
    return null;
  }

  return (
    <Modal
      transparent
      visible={visible}
      animationType="fade"
      statusBarTranslucent>
      <View style={styles.overlay}>
        <Animated.View style={[styles.container, containerAnimatedStyle]}>
          <View style={styles.imageContainer}>
            <Image
              source={require('@/assets/images/Snappy_Wave_Animation.png')}
              style={styles.animation}
              contentFit="contain"
              transition={200}
            />
          </View>
          <Animated.Text style={[styles.message, messageAnimatedStyle]}>
            {MESSAGES[currentMessageIndex]}
          </Animated.Text>
        </Animated.View>
      </View>
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
  imageContainer: {
    width: 120,
    height: 120,
    justifyContent: 'center',
    alignItems: 'center',
  },
  animation: {
    width: '100%',
    height: '100%',
  },
  message: {
    fontSize: 16,
    color: '#0F172A',
    fontWeight: '500',
    textAlign: 'center',
  },
});
