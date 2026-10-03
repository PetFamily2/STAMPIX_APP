import { useQuery } from 'convex/react';
import { useRouter } from 'expo-router';
import {
  ArrowRight,
  Building2,
  CircleDollarSign,
  Clock3,
  ReceiptText,
  ShieldCheck,
  Users,
} from 'lucide-react-native';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { FullScreenLoading } from '@/components/FullScreenLoading';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { BUSINESS_WEB_TOKENS as TOKENS } from '@/lib/design/businessWebTokens';
import { flexDirection, rtlBaseText } from '@/lib/rtl';

function formatDate(value: number | null | undefined) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('he-IL', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function Field({
  label,
  value,
}: {
  label: string;
  value: string | number | null | undefined;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Text selectable={true} style={styles.fieldValue}>
        {value === null || value === undefined || value === '' ? '—' : String(value)}
      </Text>
    </View>
  );
}

export function AdminBusinessDetail({
  businessId,
}: {
  businessId: Id<'businesses'>;
}) {
  const router = useRouter();
  const detail = useQuery(api.adminWeb.getBusinessDetail, { businessId });

  if (detail === undefined) {
    return <FullScreenLoading />;
  }

  if (!detail) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyTitle}>העסק לא נמצא</Text>
        <Pressable onPress={() => router.replace('/admin')} style={styles.backButton}>
          <Text style={styles.backButtonText}>חזרה לאדמין</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <ScrollView
      contentContainerStyle={styles.page}
      showsVerticalScrollIndicator={false}
    >
      <Pressable onPress={() => router.back()} style={styles.backLink}>
        <ArrowRight color={TOKENS.colors.primary} size={18} />
        <Text style={styles.backLinkText}>חזרה למרכז התפעול</Text>
      </Pressable>

      <View style={styles.hero}>
        <View style={styles.heroIcon}>
          <Building2 color={TOKENS.colors.primary} size={26} />
        </View>
        <View style={styles.heroCopy}>
          <Text style={styles.eyebrow}>ADMIN · BUSINESS DETAIL</Text>
          <Text style={styles.title}>{detail.business.name}</Text>
          <Text style={styles.subtitle}>
            מסך תפעולי לקריאה בלבד. מזהים, מצב חיוב ואירועי ספק מוצגים לצורכי
            תמיכה ובקרה.
          </Text>
        </View>
      </View>

      <View style={styles.grid}>
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Building2 color={TOKENS.colors.primary} size={20} />
            <Text style={styles.cardTitle}>פרטי העסק</Text>
          </View>
          <Field label="מזהה פנימי" value={detail.business.businessId} />
          <Field label="מזהה חיצוני" value={detail.business.externalId} />
          <Field label="מזהה ציבורי" value={detail.business.businessPublicId} />
          <Field label="קוד הצטרפות" value={detail.business.joinCode} />
          <Field label="כתובת" value={detail.business.formattedAddress} />
          <Field label="פעיל" value={detail.business.isActive ? 'כן' : 'לא'} />
          <Field label="נוצר" value={formatDate(detail.business.createdAt)} />
        </View>

        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <ShieldCheck color={TOKENS.colors.primary} size={20} />
            <Text style={styles.cardTitle}>בעלים</Text>
          </View>
          <Field label="שם" value={detail.owner?.fullName} />
          <Field label="דוא״ל" value={detail.owner?.email} />
          <Field label="טלפון" value={detail.owner?.phone} />
          <Field
            label="חשבון פעיל"
            value={detail.owner?.isActive ? 'כן' : 'לא'}
          />
        </View>

        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <CircleDollarSign color={TOKENS.colors.primary} size={20} />
            <Text style={styles.cardTitle}>חיוב</Text>
          </View>
          <Field label="מסלול" value={detail.billing?.plan} />
          <Field label="סטטוס" value={detail.billing?.status} />
          <Field label="מחזור" value={detail.billing?.billingPeriod} />
          <Field label="ספק" value={detail.billing?.provider} />
          <Field label="מזהה מוצר ספק" value={detail.billing?.providerProductId} />
          <Field
            label="מזהה מנוי ספק"
            value={detail.billing?.providerSubscriptionIdentifier}
          />
          <Field
            label="סוף תקופה"
            value={formatDate(detail.billing?.currentPeriodEndAt)}
          />
          <Field
            label="סוף תקופת חסד"
            value={formatDate(detail.billing?.gracePeriodEndAt)}
          />
          <Field
            label="ראיית ספק"
            value={detail.billing?.hasProviderEvidence ? 'כן' : 'לא'}
          />
        </View>

        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Users color={TOKENS.colors.primary} size={20} />
            <Text style={styles.cardTitle}>שימוש וצוות</Text>
          </View>
          <Field label="לקוחות פעילים" value={detail.usage?.activeUniqueCustomers} />
          <Field label="כרטיסים" value={detail.usage?.nonArchivedCards} />
          <Field label="קמפיינים פעילים" value={detail.usage?.activeCampaigns} />
          <Field label="פעולות שימור" value={detail.usage?.activeRetentionActions} />
          <Field label="AI החודש" value={detail.usage?.aiExecutionsThisMonth} />
          <Field label="חברי צוות" value={detail.team.total} />
          <Field label="מנהלים פעילים" value={detail.team.managers} />
          <Field label="עובדים פעילים" value={detail.team.staff} />
        </View>
      </View>

      <View style={styles.wideCard}>
        <View style={styles.cardHeader}>
          <ReceiptText color={TOKENS.colors.primary} size={20} />
          <Text style={styles.cardTitle}>ניסיונות סליקה אחרונים</Text>
        </View>
        {detail.checkoutIntents.length === 0 ? (
          <Text style={styles.emptyText}>אין ניסיונות סליקה להצגה.</Text>
        ) : (
          detail.checkoutIntents.map((intent) => (
            <View key={intent.checkoutId} style={styles.eventRow}>
              <View style={styles.eventMain}>
                <Text selectable={true} style={styles.eventTitle}>
                  {intent.checkoutId}
                </Text>
                <Text style={styles.eventMeta}>
                  {intent.plan} · {intent.billingPeriod} · ₪{intent.amount} ·{' '}
                  {formatDate(intent.createdAt)}
                </Text>
              </View>
              <Text style={styles.eventStatus}>{intent.status}</Text>
            </View>
          ))
        )}
      </View>

      <View style={styles.wideCard}>
        <View style={styles.cardHeader}>
          <Clock3 color={TOKENS.colors.primary} size={20} />
          <Text style={styles.cardTitle}>אירועי SUMIT אחרונים</Text>
        </View>
        {detail.providerEvents.length === 0 ? (
          <Text style={styles.emptyText}>אין אירועי ספק להצגה.</Text>
        ) : (
          detail.providerEvents.map((event) => (
            <View key={event.externalEventId} style={styles.eventRow}>
              <View style={styles.eventMain}>
                <Text style={styles.eventTitle}>{event.eventType}</Text>
                <Text selectable={true} style={styles.eventMeta}>
                  {event.externalEventId} ·{' '}
                  {formatDate(event.providerEventAt ?? event.receivedAt)}
                </Text>
                {event.ignoredReason ? (
                  <Text style={styles.eventWarning}>{event.ignoredReason}</Text>
                ) : null}
              </View>
              <Text style={styles.eventStatus}>{event.status}</Text>
            </View>
          ))
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: {
    backgroundColor: TOKENS.colors.pageBackground,
    gap: TOKENS.space.xl,
    minHeight: '100vh' as never,
    padding: 36,
  },
  backLink: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    flexDirection: flexDirection.row,
    gap: TOKENS.space.sm,
    minHeight: 42,
  },
  backLinkText: {
    color: TOKENS.colors.primary,
    fontSize: 14,
    fontWeight: '700',
  },
  hero: {
    alignItems: 'center',
    flexDirection: flexDirection.row,
    gap: TOKENS.space.lg,
  },
  heroIcon: {
    alignItems: 'center',
    backgroundColor: TOKENS.colors.primarySubtle,
    borderRadius: TOKENS.radii.lg,
    height: 60,
    justifyContent: 'center',
    width: 60,
  },
  heroCopy: { flex: 1 },
  eyebrow: {
    color: TOKENS.colors.primary,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
  },
  title: {
    ...rtlBaseText,
    color: TOKENS.colors.textPrimary,
    fontSize: 34,
    fontWeight: '900',
    marginTop: 5,
  },
  subtitle: {
    ...rtlBaseText,
    color: TOKENS.colors.textSecondary,
    fontSize: 14,
    lineHeight: 23,
    marginTop: 7,
    maxWidth: 760,
  },
  grid: {
    flexDirection: flexDirection.row,
    flexWrap: 'wrap',
    gap: TOKENS.space.lg,
  },
  card: {
    backgroundColor: TOKENS.colors.elevatedSurface,
    borderColor: TOKENS.colors.border,
    borderRadius: TOKENS.radii.lg,
    borderWidth: 1,
    minWidth: 360,
    padding: TOKENS.space.xl,
    width: '48%' as never,
  },
  wideCard: {
    backgroundColor: TOKENS.colors.elevatedSurface,
    borderColor: TOKENS.colors.border,
    borderRadius: TOKENS.radii.lg,
    borderWidth: 1,
    padding: TOKENS.space.xl,
  },
  cardHeader: {
    alignItems: 'center',
    flexDirection: flexDirection.row,
    gap: TOKENS.space.sm,
    marginBottom: TOKENS.space.lg,
  },
  cardTitle: {
    ...rtlBaseText,
    color: TOKENS.colors.textPrimary,
    fontSize: 18,
    fontWeight: '800',
  },
  field: {
    borderTopColor: TOKENS.colors.border,
    borderTopWidth: 1,
    gap: 3,
    paddingVertical: TOKENS.space.md,
  },
  fieldLabel: {
    ...rtlBaseText,
    color: TOKENS.colors.textMuted,
    fontSize: 11,
    fontWeight: '600',
  },
  fieldValue: {
    ...rtlBaseText,
    color: TOKENS.colors.textPrimary,
    fontSize: 13,
    fontWeight: '600',
  },
  eventRow: {
    alignItems: 'center',
    borderTopColor: TOKENS.colors.border,
    borderTopWidth: 1,
    flexDirection: flexDirection.row,
    gap: TOKENS.space.lg,
    minHeight: 66,
    paddingVertical: TOKENS.space.md,
  },
  eventMain: { flex: 1, minWidth: 0 },
  eventTitle: {
    ...rtlBaseText,
    color: TOKENS.colors.textPrimary,
    fontSize: 13,
    fontWeight: '800',
  },
  eventMeta: {
    color: TOKENS.colors.textMuted,
    fontSize: 11,
    marginTop: 4,
  },
  eventWarning: {
    color: TOKENS.colors.warning,
    fontSize: 11,
    marginTop: 4,
  },
  eventStatus: {
    color: TOKENS.colors.primary,
    fontSize: 11,
    fontWeight: '700',
  },
  emptyText: {
    ...rtlBaseText,
    color: TOKENS.colors.textMuted,
    fontSize: 13,
  },
  empty: {
    alignItems: 'center',
    backgroundColor: TOKENS.colors.pageBackground,
    flex: 1,
    justifyContent: 'center',
    minHeight: '100vh' as never,
  },
  emptyTitle: {
    ...rtlBaseText,
    color: TOKENS.colors.textPrimary,
    fontSize: 22,
    fontWeight: '800',
  },
  backButton: {
    backgroundColor: TOKENS.colors.primary,
    borderRadius: TOKENS.radii.pill,
    marginTop: TOKENS.space.lg,
    paddingHorizontal: TOKENS.space.xl,
    paddingVertical: TOKENS.space.md,
  },
  backButtonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
});
