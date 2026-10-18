import { useQuery } from 'convex/react';
import { Component, type ReactNode, useState } from 'react';
import { Linking, Modal, ScrollView, StyleSheet, View } from 'react-native';
import { BusinessWebDialog } from '@/components/business-web/BusinessWebDialog';
import { LoyaltyCardClassic } from '@/components/loyalty/LoyaltyCardClassic';
import { PwaButton } from '@/components/pwa-ui/PwaButton';
import { AppText as Text } from '@/components/ui/AppText';
import { normalizeStampShape } from '@/constants/stampOptions';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { useActiveBusiness } from '@/hooks/useActiveBusiness';
import {
  webCustomerGuidance,
  webCustomerStateLabel,
} from '@/lib/customers/webCustomerGuidance';
import { BUSINESS_WEB_TOKENS as TOKENS } from '@/lib/design/businessWebTokens';
import { rtlBaseText } from '@/lib/rtl';

type Props = {
  businessId: Id<'businesses'>;
  customerUserId: Id<'users'>;
  onClose: () => void;
};

export function BusinessWebCustomerDetails(props: Props) {
  return (
    <Modal transparent={true} visible={true} onRequestClose={props.onClose}>
      <View style={styles.modal}>
        <BusinessWebDialog
          title="כרטיס לקוח"
          visible={true}
          onDismiss={props.onClose}
          maxWidth={680}
        >
          <DetailsErrorBoundary>
            <CustomerDetailsContent {...props} />
          </DetailsErrorBoundary>
        </BusinessWebDialog>
      </View>
    </Modal>
  );
}

function CustomerDetailsContent({ businessId, customerUserId }: Props) {
  const card = useQuery(api.customerCards.getBusinessCustomerCard, {
    businessId,
    customerUserId,
    limit: 30,
  });
  const { activeBusiness } = useActiveBusiness();
  const [contactError, setContactError] = useState('');
  if (card === undefined) {
    return (
      <Text style={styles.body} role="status">
        טוענים את כרטיס הלקוח…
      </Text>
    );
  }
  if (card === null) {
    return (
      <Text style={styles.body} role="status">
        לא נמצאה כרטיסייה פעילה של הלקוח בעסק הזה.
      </Text>
    );
  }
  const guidance = webCustomerGuidance({
    customerState: card.summary.customerState,
    marketingOptIn: card.customer.marketingOptIn,
    phone: card.customer.phone,
    email: card.customer.email,
  });
  const business =
    String(activeBusiness?.businessId) === String(businessId)
      ? activeBusiness
      : null;

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.section}>
        <Text accessibilityRole="header" style={styles.title}>
          {card.customer.name}
        </Text>
        <Text style={styles.body}>
          ביקור אחרון:{' '}
          {new Date(card.summary.lastVisitAt).toLocaleDateString('he-IL')} ·{' '}
          {card.summary.visitCount} ביקורים
        </Text>
      </View>
      <View style={styles.guidance}>
        <Text accessibilityRole="header" style={styles.title}>
          {webCustomerStateLabel(card.summary.customerState)}
        </Text>
        <Text style={styles.body}>{guidance.explanation}</Text>
        <Text style={styles.title}>מה מומלץ לעשות?</Text>
        <Text style={styles.body}>{guidance.nextStep}</Text>
        {!card.customer.marketingOptIn ? (
          <Text style={styles.body}>
            לא רשומה הסכמה לדיוור שיווקי. לא מוצעת כאן פנייה שיווקית.
          </Text>
        ) : guidance.contact ? (
          <>
            <PwaButton
              label={
                guidance.contact.kind === 'phone'
                  ? 'התקשרות ללקוח'
                  : 'פתיחת דוא״ל ללקוח'
              }
              variant="secondary"
              onPress={() => {
                setContactError('');
                if (guidance.contact) {
                  void Linking.openURL(guidance.contact.href).catch(() =>
                    setContactError(
                      'לא ניתן לפתוח את אפליקציית הקשר במכשיר הזה.'
                    )
                  );
                }
              }}
            />
            <Text style={styles.caption}>
              הפעולה פותחת את אפליקציית הטלפון או הדוא״ל בלבד. לא נשלחת הודעה
              אוטומטית.
            </Text>
          </>
        ) : card.summary.customerState === 'NEEDS_WINBACK' ? (
          <Text style={styles.body}>
            אין פרטי קשר תקינים לפנייה. אפשר לבדוק אותם מול הלקוח בביקור הבא.
          </Text>
        ) : null}
        {contactError ? (
          <Text role="alert" style={styles.body}>
            {contactError}
          </Text>
        ) : null}
      </View>
      <View style={styles.section}>
        <Text accessibilityRole="header" style={styles.title}>
          כרטיסיות הלקוח
        </Text>
        {card.programs.map((program) => (
          <View key={String(program.membershipId)} style={styles.program}>
            {program.targetIsValid ? (
              <LoyaltyCardClassic
                businessName={business?.name ?? 'העסק'}
                businessLogoUrl={business?.logoUrl ?? null}
                cardThemeId={program.cardThemeId}
                lifecycle={program.programLifecycle}
                programTitle={program.programTitle}
                rewardName={program.rewardName}
                maxStamps={program.maxStamps}
                progress={{
                  kind: 'actual',
                  currentStamps: program.currentStamps,
                }}
                stampShape={normalizeStampShape(program.stampShape)}
                stampIcon={program.stampIcon}
                variant="wallet"
              />
            ) : (
              <Text style={styles.title}>{program.programTitle}</Text>
            )}
            <Text style={styles.body}>
              {program.targetIsValid
                ? `${program.currentStamps} מתוך ${program.maxStamps} חותמות`
                : 'יעד הכרטיסייה אינו זמין'}
              {program.canRedeem ? ' · זכאי להטבה' : ''}
            </Text>
          </View>
        ))}
      </View>
      <View style={styles.section}>
        <Text accessibilityRole="header" style={styles.title}>
          פעילות אחרונה
        </Text>
        <Text style={styles.caption}>
          עד 30 פעולות אחרונות. הצפייה אינה משנה חותמות או מימושים.
        </Text>
        {card.timeline.map((item) => (
          <View key={item.id} style={styles.event}>
            <Text style={styles.body}>
              {item.detail}
              {item.isReversed ? ' · בוטל' : ''}
            </Text>
            <Text style={styles.caption}>
              {item.programTitle} ·{' '}
              {new Date(item.createdAt).toLocaleString('he-IL')}
            </Text>
          </View>
        ))}
        {card.timeline.length === 0 ? (
          <Text style={styles.body}>עדיין אין פעילות להצגה.</Text>
        ) : null}
      </View>
    </ScrollView>
  );
}

class DetailsErrorBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <View style={styles.section}>
        <Text role="alert" style={styles.body}>
          לא הצלחנו לטעון את פרטי הלקוח. בדקו חיבור והרשאה לעסק ונסו שוב.
        </Text>
        <PwaButton
          label="לנסות שוב"
          variant="secondary"
          onPress={() => this.setState({ failed: false })}
        />
      </View>
    ) : (
      this.props.children
    );
  }
}

const styles = StyleSheet.create({
  modal: { flex: 1 },
  scroll: { flexShrink: 1 },
  content: { gap: TOKENS.space.xl },
  section: { gap: TOKENS.space.sm },
  title: {
    ...rtlBaseText,
    ...TOKENS.typography.sectionTitle,
    color: TOKENS.colors.textPrimary,
  },
  body: {
    ...rtlBaseText,
    ...TOKENS.typography.body,
    color: TOKENS.colors.textSecondary,
  },
  caption: {
    ...rtlBaseText,
    ...TOKENS.typography.secondaryBody,
    color: TOKENS.colors.textMuted,
  },
  guidance: {
    gap: TOKENS.space.sm,
    padding: TOKENS.space.lg,
    borderRadius: TOKENS.radii.md,
    backgroundColor: TOKENS.colors.primarySubtle,
  },
  program: { gap: TOKENS.space.sm },
  event: {
    gap: TOKENS.space.xs,
    paddingVertical: TOKENS.space.sm,
    borderBottomWidth: 1,
    borderBottomColor: TOKENS.colors.border,
  },
});
