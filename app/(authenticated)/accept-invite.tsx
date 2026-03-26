import { useMutation } from 'convex/react';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  SafeAreaView,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';

import { BackButton } from '@/components/BackButton';
import StickyScrollHeader from '@/components/StickyScrollHeader';
import { useSessionContext } from '@/contexts/UserContext';
import { api } from '@/convex/_generated/api';
import { safeBack } from '@/lib/navigation';
import { tw } from '@/lib/rtl';

const TEXT = {
  title: 'הצטרפות כעובד',
  subtitle: 'הזן את קוד ההזמנה שקיבלת מבעל העסק',
  manualPlaceholder: 'קוד הזמנה',
  accept: 'אשר הצטרפות',
  accepting: 'מצטרף',
  inviteNotFound: 'ההזמנה לא נמצאה או פגה תוקפה',
  inviteExpired: 'ההזמנה פגה תוקפה',
  emailMismatch: 'ההזמנה נשלחה לכתובת אימייל אחרת',
  errorGeneric: 'אירעה שגיאה נסה שוב',
  pendingInviteTitle: 'הזמנה ממתינה',
  pendingInviteSubtitle: 'הוזמנת להצטרף כעובד ל',
};

const ERROR_MAP: Record<string, string> = {
  INVITE_NOT_FOUND: TEXT.inviteNotFound,
  INVITE_NOT_PENDING: TEXT.inviteNotFound,
  INVITE_EXPIRED: TEXT.inviteExpired,
  EMAIL_MISMATCH: TEXT.emailMismatch,
};

function nextRouteByStaffRole(staffRole: 'manager' | 'staff' | 'owner' | null) {
  if (staffRole === 'owner' || staffRole === 'manager') {
    return '/(authenticated)/(business)/dashboard';
  }
  return '/(authenticated)/(staff)/scanner';
}

export default function AcceptInviteScreen() {
  const insets = useSafeAreaInsets();
  const { inviteCode: paramCode } = useLocalSearchParams<{
    inviteCode?: string;
  }>();
  const sessionContext = useSessionContext();
  const acceptStaffInvite = useMutation(api.business.acceptStaffInvite);

  const [manualCode, setManualCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pendingInvites = sessionContext?.pendingInvites ?? [];
  const hasParamCode = Boolean(paramCode?.trim());
  const hasPendingInvite = pendingInvites.length > 0;
  const showPendingInviteCard = hasPendingInvite && !hasParamCode;
  const showManualCodeCard = !hasPendingInvite || hasParamCode;
  const effectiveCode =
    (paramCode ?? manualCode).trim() || pendingInvites[0]?.inviteCode;

  useEffect(() => {
    if (paramCode?.trim()) {
      setManualCode(paramCode.trim());
    }
  }, [paramCode]);

  const handleAccept = async () => {
    const code =
      (paramCode ?? manualCode).trim() || pendingInvites[0]?.inviteCode;
    if (!code) {
      setError(TEXT.inviteNotFound);
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const result = await acceptStaffInvite({ inviteCode: code });
      router.replace(nextRouteByStaffRole(result?.staffRole ?? null));
    } catch (e) {
      const msg = ERROR_MAP[(e as Error).message] ?? TEXT.errorGeneric;
      setError(msg);
    } finally {
      setBusy(false);
    }
  };

  const canAccept = effectiveCode && effectiveCode.length > 0 && !busy;

  return (
    <SafeAreaView className="flex-1 bg-[#E9F0FF]" edges={[]}>
      <ScrollView
        stickyHeaderIndices={[0]}
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 40 }}
      >
        <StickyScrollHeader
          topPadding={(insets.top || 0) + 12}
          backgroundColor="#E9F0FF"
        >
          <View className="px-6 pt-6 pb-8">
            <View className="flex-row-reverse items-center justify-between">
              <BackButton
                onPress={() => safeBack('/(authenticated)/(customer)/wallet')}
              />
              <Text
                className={`text-2xl font-bold text-gray-900 ${tw.textStart}`}
              >
                {TEXT.title}
              </Text>
              <View className="w-11 h-11" />
            </View>
          </View>
        </StickyScrollHeader>

        <View className="px-6">
          {showPendingInviteCard && (
            <View className="mt-6 rounded-2xl border border-blue-200 bg-blue-50 p-4">
              <Text
                className={`text-xs font-semibold text-blue-800 ${tw.textStart}`}
              >
                {TEXT.pendingInviteTitle}
              </Text>
              <Text className={`text-sm text-blue-700 mt-1 ${tw.textStart}`}>
                {TEXT.pendingInviteSubtitle} {pendingInvites[0].businessName}
              </Text>
              <Pressable
                onPress={async () => {
                  const code = pendingInvites[0].inviteCode;
                  setError(null);
                  setBusy(true);
                  try {
                    const result = await acceptStaffInvite({
                      inviteCode: code,
                    });
                    router.replace(
                      nextRouteByStaffRole(result?.staffRole ?? null)
                    );
                  } catch (e) {
                    setError(
                      ERROR_MAP[(e as Error).message] ?? TEXT.errorGeneric
                    );
                  } finally {
                    setBusy(false);
                  }
                }}
                disabled={busy}
                className="mt-3 self-start rounded-xl bg-blue-600 px-4 py-2"
              >
                {busy ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text className="text-sm font-bold text-white">
                    {TEXT.accept}
                  </Text>
                )}
              </Pressable>
              {error && (
                <Text className={`mt-3 text-sm text-rose-600 ${tw.textStart}`}>
                  {error}
                </Text>
              )}
            </View>
          )}

          {showManualCodeCard ? (
            <View className="mt-6 rounded-2xl border border-zinc-200 bg-white p-4">
              <Text
                className={`text-xs font-semibold text-zinc-500 ${tw.textStart}`}
              >
                קוד הזמנה
              </Text>
              <TextInput
                value={manualCode}
                onChangeText={(t) => {
                  setManualCode(t);
                  setError(null);
                }}
                placeholder={TEXT.manualPlaceholder}
                placeholderTextColor="#9ca3af"
                autoCapitalize="characters"
                autoCorrect={false}
                editable={!busy}
                className="mt-2 rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-base text-gray-900"
              />
              {error && (
                <Text className={`mt-2 text-sm text-rose-600 ${tw.textStart}`}>
                  {error}
                </Text>
              )}
              <Pressable
                onPress={handleAccept}
                disabled={!canAccept}
                className={`mt-4 rounded-xl px-4 py-3 items-center ${
                  canAccept ? 'bg-blue-600' : 'bg-zinc-300'
                }`}
              >
                {busy ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text
                    className={`text-sm font-bold ${canAccept ? 'text-white' : 'text-zinc-500'}`}
                  >
                    {TEXT.accept}
                  </Text>
                )}
              </Pressable>
            </View>
          ) : null}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
