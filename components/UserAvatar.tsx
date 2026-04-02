import { Image, StyleSheet, Text, View } from 'react-native';

type UserAvatarProps = {
  avatarUrl?: string | null;
  fullName?: string | null;
  size?: number;
};

function getInitials(fullName?: string | null) {
  const normalized = fullName?.trim();
  if (!normalized) {
    return 'S';
  }

  return normalized
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0] ?? '')
    .join('')
    .toUpperCase();
}

export function UserAvatar({
  avatarUrl,
  fullName,
  size = 64,
}: UserAvatarProps) {
  const initials = getInitials(fullName);
  const borderRadius = size / 2;

  return (
    <View
      style={[
        styles.container,
        {
          width: size,
          height: size,
          borderRadius,
        },
      ]}
    >
      {avatarUrl ? (
        <Image
          source={{ uri: avatarUrl }}
          style={styles.image}
          accessibilityLabel={`תמונת פרופיל של ${fullName?.trim() || 'המשתמש'}`}
        />
      ) : (
        <Text style={[styles.fallback, { fontSize: Math.max(18, size * 0.34) }]}>
          {initials}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CFE0F7',
    shadowColor: '#2F6BFF',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 3,
  },
  image: {
    width: '100%',
    height: '100%',
  },
  fallback: {
    color: '#2F6BFF',
    fontWeight: '900',
    textAlign: 'center',
  },
});
