import { useMutation } from 'convex/react';
import { type Href, useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, Text, View } from 'react-native';

import {
  BusinessSettingsSubpageHeader,
  SettingsGroup,
  SettingsNavRow,
  SettingsPageShell,
  SettingsSection,
  SETTINGS_TOKENS,
} from '@/components/business-settings';
import { useAppMode } from '@/contexts/AppModeContext';
import { api } from '@/convex/_generated/api';
import { useActiveBusiness } from '@/hooks/useActiveBusiness';
import { BUSINESS_ROUTES } from '@/lib/navigation/businessRoutes';

export default function BusinessSettingsAccountDataScreen() {
  const router = useRouter();
  const { setAppMode } = useAppMode();
  const setActiveMode = useMutation(api.users.setActiveMode);
  const closeBusinessAccount = useMutation(api.business.closeBusinessAccount);
  const selfRemoveFromBusiness = useMutation(
    api.business.selfRemoveFromBusiness
  );
  const { activeBusiness, activeBusinessId } = useActiveBusiness();
  const [isClosingBusiness, setIsClosingBusiness] = useState(false);
  const [isLeavingBusiness, setIsLeavingBusiness] = useState(false);

  const canLeaveBusiness = activeBusiness
    ? activeBusiness.staffRole !== 'owner'
    : false;
  const canCloseBusiness = activeBusiness?.staffRole === 'owner';

  const goToPrivateArea = async () => {
    await setAppMode('customer');
    router.replace('/(authenticated)/(customer)/wallet');
    void setActiveMode({ mode: 'customer' }).catch(async () => {
      await setAppMode('business');
      router.replace(BUSINESS_ROUTES.settings as Href);
      Alert.alert('שגיאה', 'לא הצלחנו לעדכן את מצב המשתמש. נסו שוב.');
    });
  };

  const handleLeaveBusiness = () => {
    if (!activeBusinessId || isLeavingBusiness) {
      return;
    }
    Alert.alert(
      'לעזוב את העסק?',
      'הגישה שלך למסכי הניהול של העסק הפעיל תוסר, ותועבר לאזור האישי.',
      [
        { text: 'ביטול', style: 'cancel' },
        {
          text: 'עזוב את העסק',
          style: 'destructive',
          onPress: async () => {
            if (!activeBusinessId || isLeavingBusiness) {
              return;
            }
            setIsLeavingBusiness(true);
            try {
              await selfRemoveFromBusiness({ businessId: activeBusinessId });
              await goToPrivateArea();
            } catch {
              Alert.alert('שגיאה', 'לא הצלחנו לעזוב את העסק. נסו שוב.');
            } finally {
              setIsLeavingBusiness(false);
            }
          },
        },
      ]
    );
  };

  const handleCloseBusiness = () => {
    if (!activeBusinessId || !canCloseBusiness || isClosingBusiness) {
      return;
    }
    Alert.alert(
      'סגירת העסק?',
      'העסק יפסיק לפעול ב-StampAix, העובדים יאבדו גישה תפעולית וכרטיסיות העסק יוסתרו מהלקוחות. כל המידע יישמר ויהיה ניתן לשחזר את העסק בהמשך.',
      [
        { text: 'ביטול', style: 'cancel' },
        {
          text: 'סגור את העסק',
          style: 'destructive',
          onPress: async () => {
            if (!activeBusinessId || isClosingBusiness) {
              return;
            }
            setIsClosingBusiness(true);
            try {
              await closeBusinessAccount({ businessId: activeBusinessId });
              await setAppMode('customer');
              router.replace('/(authenticated)/(customer)/wallet');
            } catch {
              Alert.alert(
                'שגיאה',
                'לא הצלחנו לסגור את העסק. ודאו שיש לכם הרשאת בעלים ונסו שוב.'
              );
            } finally {
              setIsClosingBusiness(false);
            }
          },
        },
      ]
    );
  };

  const handlePermanentBusinessDeletion = () => {
    if (!activeBusinessId || !canCloseBusiness) {
      return;
    }
    router.push(
      `/(authenticated)/business-permanent-deletion?businessId=${encodeURIComponent(
        String(activeBusinessId)
      )}` as Href
    );
  };

  return (
    <SettingsPageShell
      header={
        <BusinessSettingsSubpageHeader
          title="ניהול חשבון ונתונים"
          subtitle="פעולות נדירות לעסק ולנתונים. לא יציאה מהמכשיר ולא ביטול מנוי."
          fallbackHref={BUSINESS_ROUTES.account}
        />
      }
    >
      <Text
        style={{
          fontSize: 14,
          lineHeight: 21,
          color: SETTINGS_TOKENS.textSecondary,
          textAlign: 'right',
          writingDirection: 'rtl',
        }}
      >
        האזור הזה מיועד לפעולות שמשנות גישה לעסק או מוחקות נתונים. השתמשו בו רק
        כשזה באמת נדרש.
      </Text>

      {canLeaveBusiness || canCloseBusiness ? (
        <SettingsSection title="פעולות הרסניות">
          <SettingsGroup>
            {canLeaveBusiness ? (
              <SettingsNavRow
                title="עזיבת העסק"
                subtitle="הסרת הגישה שלך לעסק הפעיל"
                destructive={true}
                disabled={isLeavingBusiness}
                onPress={handleLeaveBusiness}
                isLast={!canCloseBusiness}
                accessibilityHint="פעולה הרסנית. מסירה את הגישה שלך לעסק ואינה מתנתקת מהמכשיר"
              />
            ) : null}
            {canCloseBusiness ? (
              <>
                <SettingsNavRow
                  title="סגירת העסק"
                  subtitle="העסק יוסתר ויהיה ניתן לשחזר"
                  destructive={true}
                  disabled={isClosingBusiness}
                  onPress={handleCloseBusiness}
                  accessibilityHint="פעולה הרסנית. סגירת העסק ב-StampAix ואינה ביטול מנוי"
                />
                <SettingsNavRow
                  title="מחיקת העסק לצמיתות"
                  subtitle="פעולה בלתי הפיכה"
                  destructive={true}
                  onPress={handlePermanentBusinessDeletion}
                  isLast={true}
                  accessibilityHint="פעולה הרסנית ובלתי הפיכה"
                />
              </>
            ) : null}
          </SettingsGroup>
        </SettingsSection>
      ) : (
        <Text
          style={{
            fontSize: 14,
            lineHeight: 21,
            color: SETTINGS_TOKENS.textSecondary,
            textAlign: 'right',
            writingDirection: 'rtl',
          }}
        >
          אין פעולות נתונים זמינות לחשבון זה.
        </Text>
      )}

      {isLeavingBusiness || isClosingBusiness ? (
        <View style={{ alignItems: 'center', paddingVertical: 8 }}>
          <ActivityIndicator color={SETTINGS_TOKENS.accent} />
        </View>
      ) : null}
    </SettingsPageShell>
  );
}
