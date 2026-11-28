import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';

import { AppText as Text } from '@/components/ui/AppText';
import { BUSINESS_WEB_TOKENS as T } from '@/lib/design/businessWebTokens';
import { flexDirection, rtlBaseView } from '@/lib/rtl';

export function CampaignCustomerPreview({
  businessName,
  title,
  body,
  embedded = false,
}: {
  businessName: string;
  title: string;
  body: string;
  embedded?: boolean;
}) {
  return (
    <View
      accessibilityLabel={`תצוגת הודעה ללקוח מאת ${businessName}`}
      style={[styles.notification, embedded && styles.embedded]}
    >
      <View style={[styles.iconCanvas, embedded && styles.embeddedIcon]}>
        <Ionicons name="notifications-outline" size={21} color="#1D4ED8" />
      </View>
      <View style={styles.copy}>
        <Text numberOfLines={1} style={styles.businessName}>
          {businessName}
        </Text>
        <Text
          numberOfLines={2}
          style={[styles.title, embedded && styles.embeddedTitle]}
        >
          {title.trim() || 'כותרת ההודעה'}
        </Text>
        <Text numberOfLines={3} style={styles.body}>
          {body.trim() || 'תוכן ההודעה יופיע כאן'}
        </Text>
        <Text style={styles.channel}>הודעה באפליקציה</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  notification: {
    width: '100%',
    flexDirection: flexDirection.row,
    gap: 10,
    borderWidth: 1,
    borderColor: '#DCE6F7',
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 13,
    paddingVertical: 12,
    ...rtlBaseView,
  },
  iconCanvas: {
    width: 40,
    height: 40,
    flexShrink: 0,
    borderRadius: 12,
    backgroundColor: '#E8F1FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  embedded: {
    borderWidth: 0,
    backgroundColor: T.colors.subtleSurface,
    borderRadius: T.radii.md,
    padding: T.space.sm,
  },
  embeddedIcon: {
    width: T.icons.container,
    height: T.icons.container,
    borderRadius: T.radii.sm,
  },
  embeddedTitle: { ...T.typography.cardTitle, color: T.colors.textPrimary },
  copy: {
    flex: 1,
    minWidth: 0,
    alignItems: 'stretch',
    gap: 2,
  },
  businessName: {
    width: '100%',
    color: '#64748B',
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '700',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  title: {
    width: '100%',
    color: '#12203A',
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '800',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  body: {
    width: '100%',
    color: '#475569',
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '500',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  channel: {
    width: '100%',
    marginTop: 3,
    color: '#1D4ED8',
    fontSize: 10,
    lineHeight: 14,
    fontWeight: '800',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
});
