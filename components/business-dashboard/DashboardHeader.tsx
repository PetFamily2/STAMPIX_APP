import { Ionicons } from '@expo/vector-icons';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { STAMPAIX_IMAGE_LOGO } from '@/config/branding';
import { tw } from '@/lib/rtl';

function getGreeting() {
  const hour = Number(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Jerusalem',
      hour: '2-digit',
      hourCycle: 'h23',
    }).format(new Date())
  );

  if (hour < 12) {
    return 'בוקר טוב';
  }
  if (hour < 17) {
    return 'צהריים טובים';
  }
  return 'ערב טוב';
}

function getInitials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0] ?? '')
    .join('')
    .toUpperCase();
}

export function DashboardHeader({
  businessName,
  logoUrl,
  onPressMenu,
}: {
  businessName: string;
  logoUrl?: string | null;
  onPressMenu: () => void;
}) {
  const greeting = getGreeting();
  const initials = getInitials(businessName || 'עסק');

  return (
    <View style={styles.wrap}>
      <Pressable onPress={onPressMenu} style={styles.menuButton}>
        <Ionicons name="menu-outline" size={20} color="#25337B" />
      </Pressable>

      <View style={styles.identityBlock}>
        <View style={styles.avatarWrap}>
          {logoUrl ? (
            <Image
              source={{ uri: logoUrl }}
              style={styles.avatarImage}
              accessibilityLabel={`${businessName} logo`}
            />
          ) : (
            <Text style={styles.avatarFallback}>{initials || 'S'}</Text>
          )}
        </View>

        <View style={styles.copyWrap}>
          <Text
            className={tw.textStart}
            numberOfLines={1}
            style={styles.titleLine}
          >
            {`${greeting}, `}
            <Text style={styles.businessName}>{businessName}</Text>
          </Text>

          <View style={styles.brandRow}>
            <Image
              source={STAMPAIX_IMAGE_LOGO}
              style={styles.brandLogo}
              resizeMode="contain"
              accessibilityLabel="StampAix brand logo"
            />
            <Text className={tw.textStart} style={styles.brandLine}>
              StampAix
            </Text>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    minHeight: 70,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  menuButton: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.88)',
    borderWidth: 1,
    borderColor: '#E3E9F5',
    shadowColor: '#0F172A',
    shadowOpacity: 0.06,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  identityBlock: {
    flex: 1,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 10,
  },
  avatarWrap: {
    width: 46,
    height: 46,
    borderRadius: 23,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D7DFF0',
    shadowColor: '#0F172A',
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  avatarFallback: {
    fontSize: 16,
    fontWeight: '800',
    color: '#3F51D7',
  },
  copyWrap: {
    flex: 1,
    gap: 4,
    alignItems: 'stretch',
  },
  titleLine: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '600',
    color: '#2C3558',
  },
  businessName: {
    fontSize: 21,
    lineHeight: 26,
    fontWeight: '900',
    color: '#0F172A',
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
  },
  brandLogo: {
    width: 18,
    height: 18,
  },
  brandLine: {
    fontSize: 13,
    lineHeight: 17,
    fontWeight: '800',
    color: '#4F46E5',
  },
});
