import React, { useEffect } from 'react';
import { StyleSheet, Text } from 'react-native';
import Animated, {
    useAnimatedStyle,
    useSharedValue,
    withRepeat,
    withSequence,
    withTiming,
} from 'react-native-reanimated';

interface QuotaCounterPillProps {
  remaining: number;
  limit: number;
  label?: string;
}

export function QuotaCounterPill({ remaining, limit, label = 'Creations left today' }: QuotaCounterPillProps) {
  const pulseScale = useSharedValue(1);
  const pulseOpacity = useSharedValue(1);

  // Pulse animation when remaining <= 1
  useEffect(() => {
    if (remaining <= 1) {
      pulseScale.value = withRepeat(
        withSequence(
          withTiming(1.05, { duration: 200 }),
          withTiming(1, { duration: 200 })
        ),
        -1,
        true
      );
      pulseOpacity.value = withRepeat(
        withSequence(
          withTiming(0.7, { duration: 200 }),
          withTiming(1, { duration: 200 })
        ),
        -1,
        true
      );
    } else {
      pulseScale.value = withTiming(1, { duration: 200 });
      pulseOpacity.value = withTiming(1, { duration: 200 });
    }
  }, [remaining, pulseScale, pulseOpacity]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseScale.value }],
    opacity: pulseOpacity.value,
  }));

  const isLow = remaining <= 2;
  const isCritical = remaining <= 1;

  const accessibilityLabel = `${label}: ${remaining} of ${limit} remaining`;

  return (
    <Animated.View
      style={[styles.container, isLow && styles.containerLow, animatedStyle]}
      accessible={true}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="text">
      <Text style={[styles.text, isLow && styles.textLow]}>
        {label}: {remaining} total
      </Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  containerLow: {
    backgroundColor: '#FEF3C7',
    borderColor: '#FDE68A',
  },
  text: {
    fontSize: 12,
    fontWeight: '500',
    color: '#64748B',
  },
  textLow: {
    color: '#92400E',
    fontWeight: '600',
  },
});
