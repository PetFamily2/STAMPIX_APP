import { Image, StyleSheet, Text, View } from 'react-native';

import { STAMPAIX_IMAGE_LOGO } from '@/config/branding';

type ProgramCustomerCardPreviewProps = {
  businessName: string;
  rewardName: string;
  maxStamps: number;
  previewCurrentStamps?: number;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export default function ProgramCustomerCardPreview({
  businessName,
  rewardName,
  maxStamps,
  previewCurrentStamps,
}: ProgramCustomerCardPreviewProps) {
  const goal = Math.max(1, maxStamps);
  const current = clamp(previewCurrentStamps ?? Math.min(3, goal), 0, goal);
  const dots = Math.min(goal, 20);
  const overflow = Math.max(0, goal - dots);
  const dotIds = Array.from({ length: dots }, (_, index) => index + 1);

  return (
    <View style={styles.cardContainer}>
      <View style={styles.cardTopRow}>
        <Text style={styles.progressLabel}>
          {current}/{goal}
        </Text>

        <View style={styles.cardTextColumn}>
          <Text style={styles.cardTitle}>{businessName}</Text>
          <Text style={styles.cardSubtitle}>הטבה: {rewardName}</Text>
        </View>

        <View style={styles.imagePlaceholder}>
          <Image
            source={STAMPAIX_IMAGE_LOGO}
            style={styles.cardImage}
            resizeMode="contain"
            accessibilityLabel="StampAix logo"
          />
        </View>
      </View>

      <View style={styles.stampRow}>
        {dotIds.map((dotId) => (
          <View
            key={`${rewardName}-${dotId}`}
            style={[
              styles.stampDot,
              dotId <= current ? styles.stampDotActive : styles.stampDotEmpty,
            ]}
          />
        ))}
        {overflow > 0 ? <Text style={styles.moreText}>+{overflow}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  cardContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E3E9FF',
    shadowColor: '#000000',
    shadowOpacity: 0.03,
    shadowRadius: 10,
    elevation: 2,
  },
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  cardTextColumn: {
    flex: 1,
    gap: 2,
    marginHorizontal: 8,
  },
  progressLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: '#2F6BFF',
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0B1220',
    textAlign: 'right',
  },
  imagePlaceholder: {
    width: 52,
    height: 52,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#D7E3FF',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#184399',
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  cardImage: {
    width: 36,
    height: 36,
  },
  cardSubtitle: {
    marginTop: 4,
    fontSize: 13,
    color: '#5B6475',
    textAlign: 'right',
  },
  stampRow: {
    marginTop: 12,
    flexDirection: 'row-reverse',
    gap: 8,
    flexWrap: 'wrap',
  },
  stampDot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
  },
  stampDotActive: {
    backgroundColor: '#2F6BFF',
    borderColor: '#2F6BFF',
  },
  stampDotEmpty: {
    borderColor: '#E5EAF5',
    backgroundColor: '#E9EEF9',
  },
  moreText: {
    fontSize: 11,
    color: '#5B6475',
    fontWeight: '700',
  },
});
