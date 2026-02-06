import { useMutation, useQuery } from 'convex/react';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BackButton } from '@/components/BackButton';
import { useAppMode } from '@/contexts/AppModeContext';
import { useUser } from '@/contexts/UserContext';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { safeBack } from '@/lib/navigation';
import { tw } from '@/lib/rtl';

const formatDate = (timestamp: number) =>
  new Date(timestamp).toLocaleDateString('he-IL', {
    day: '2-digit',
    month: 'short',
  });

export default function BusinessTeamScreen() {
  const router = useRouter();
  const { appMode, isLoading: isAppModeLoading } = useAppMode();
  const { user } = useUser();
  const isOwner = user?.role === 'merchant';
  const businesses = useQuery(api.scanner.myBusinesses) ?? [];
  const [selectedBusinessId, setSelectedBusinessId] =
    useState<Id<'businesses'> | null>(null);

  useEffect(() => {
    setSelectedBusinessId((current) => {
      const list = businesses ?? [];
      if (!list.length) {
        return null;
      }
      if (current && list.some((b) => b.businessId === current)) {
        return current;
      }
      return list[0].businessId;
    });
  }, [businesses]);

  useEffect(() => {
    if (isAppModeLoading) {
      return;
    }
    if (appMode !== 'business') {
      router.replace('/(authenticated)/(customer)/wallet');
    }
  }, [appMode, isAppModeLoading, router]);

  const staffListArgs = selectedBusinessId
    ? { businessId: selectedBusinessId }
    : 'skip';
  const staffMembers = useQuery(api.business.listBusinessStaff, staffListArgs);

  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteSuccess, setInviteSuccess] = useState<string | null>(null);
  const [isInviting, setIsInviting] = useState(false);
  const inviteStaff = useMutation(api.business.inviteBusinessStaff);

  const handleInvite = async () => {
    if (!selectedBusinessId) {
      setInviteError('בחר עסק פעיל לפני הזמנה');
      return;
    }
    if (!inviteEmail.trim()) {
      setInviteError('הזן כתובת אימייל תקינה');
      return;
    }
    if (!isOwner) {
      setInviteError('רק בעל העסק יכול להזמין עובדים');
      return;
    }

    setInviteError(null);
    setInviteSuccess(null);
    setIsInviting(true);
    try {
      await inviteStaff({
        businessId: selectedBusinessId,
        email: inviteEmail.trim(),
      });
      setInviteSuccess('ההזמנה נשלחה בהצלחה!');
      setInviteEmail('');
    } catch (error: unknown) {
      setInviteError((error as Error).message ?? 'אירעה שגיאה בהזמנה');
    } finally {
      setIsInviting(false);
    }
  };

  const staffList = staffMembers ?? [];

  return (
    <SafeAreaView className="flex-1 bg-[#E9F0FF]" edges={[]}>
      <ScrollView className="flex-1">
        <View className="max-w-3xl w-full mx-auto px-6 pb-16 pt-6 space-y-6">
          <View className="flex-row-reverse items-center justify-between">
            <BackButton
              onPress={() => safeBack('/(authenticated)/(business)/dashboard')}
            />
            <Text className={`text-white text-2xl font-bold ${tw.textStart}`}>
              {
                '\u05e0\u05d9\u05d4\u05d5\u05dc \u05e6\u05d5\u05d5\u05ea \u05e2\u05d5\u05d1\u05d3\u05d9\u05dd'
              }
            </Text>
            <View className="w-11 h-11" />
          </View>

          <Text className={`text-zinc-400 text-xs ${tw.textStart}`}>
            הוסף חברי צוות עם הרשאות סריקה ורשמ/י היסטוריית פעילות.
          </Text>

          <View className="rounded-3xl border border-zinc-800 bg-zinc-950 p-5 space-y-3">
            <Text
              className={`text-[10px] uppercase tracking-[0.4em] text-zinc-500 ${tw.textStart}`}
            >
              בחר עסק
            </Text>
            <View className="flex-row flex-wrap gap-2">
              {businesses.map((business) => {
                const isActive = business.businessId === selectedBusinessId;
                return (
                  <TouchableOpacity
                    key={business.businessId}
                    onPress={() => setSelectedBusinessId(business.businessId)}
                    className={`px-4 py-2 rounded-2xl border ${
                      isActive
                        ? 'border-cyan-500 bg-cyan-600/10'
                        : 'border-zinc-800 bg-zinc-900'
                    }`}
                  >
                    <Text className="text-sm font-semibold text-white">
                      {business.name}
                    </Text>
                    <Text className="text-[11px] text-zinc-500">
                      {business.externalId}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          <View className="rounded-3xl border border-zinc-800 bg-zinc-950 p-5 space-y-3">
            <Text
              className={`text-[10px] uppercase tracking-[0.4em] text-zinc-500 ${tw.textStart}`}
            >
              הזמן עובד חדש
            </Text>
            <TextInput
              value={inviteEmail}
              onChangeText={(text) => setInviteEmail(text)}
              placeholder="אימייל העובד"
              placeholderTextColor="#52525b"
              keyboardType="email-address"
              autoCapitalize="none"
              className="bg-zinc-900 border border-zinc-800 rounded-2xl px-4 py-3 text-white text-base"
            />
            <TouchableOpacity
              onPress={handleInvite}
              disabled={isInviting || !inviteEmail.trim()}
              className={`w-full rounded-2xl border px-4 py-3 text-center ${
                isInviting || !inviteEmail.trim()
                  ? 'border-zinc-800 bg-zinc-900'
                  : 'border-emerald-400 bg-emerald-500/10'
              }`}
            >
              {isInviting ? (
                <ActivityIndicator color="#4ade80" />
              ) : (
                <Text
                  className={`text-sm font-bold ${isInviting ? 'text-zinc-500' : 'text-emerald-200'}`}
                >
                  שלח הזמנה
                </Text>
              )}
            </TouchableOpacity>
            {inviteError && (
              <Text className="text-xs text-rose-400">{inviteError}</Text>
            )}
            {inviteSuccess && (
              <Text className="text-xs text-emerald-400">{inviteSuccess}</Text>
            )}
            {!isOwner && (
              <Text className="text-xs text-zinc-500">
                רק בעל העסק יכול להזמין עובדים חדשים.
              </Text>
            )}
          </View>

          <View className="space-y-4">
            <View className="flex-row items-center justify-between">
              <Text
                className={`text-[10px] uppercase tracking-[0.4em] text-zinc-500 ${tw.textStart}`}
              >
                צוות פעיל
              </Text>
              <Text className="text-xs text-zinc-500">
                {staffMembers
                  ? staffList.length
                    ? `${staffList.length} חברים`
                    : 'אין עובדים'
                  : 'טוען...'}
              </Text>
            </View>
            {staffMembers === undefined ? (
              <ActivityIndicator color="#4fc3f7" />
            ) : staffList.length === 0 ? (
              <View className="rounded-2xl border border-dashed border-zinc-800 px-4 py-6 items-center">
                <Text className="text-sm text-zinc-500 text-center">
                  אין עדיין עובדים שמחוברים לעסק הנבחר.
                </Text>
              </View>
            ) : (
              staffList.map((member) => (
                <View
                  key={member.staffId}
                  className="rounded-3xl border border-zinc-800 bg-zinc-900 p-4 space-y-2"
                >
                  <View className="flex-row items-start justify-between">
                    <View>
                      <Text className="text-base font-bold text-white">
                        {member.displayName}
                      </Text>
                      <Text className="text-[11px] text-zinc-500">
                        {member.email ?? 'אימייל לא מוגדר'}
                      </Text>
                    </View>
                    <View className="items-end">
                      <Text className="text-[10px] font-bold uppercase tracking-[0.3em] text-zinc-500">
                        {member.staffRole === 'owner' ? 'בעלים' : 'עובד'}
                      </Text>
                      <Text className="text-[11px] text-zinc-400">
                        {member.role ?? 'אין תפקיד'}
                      </Text>
                    </View>
                  </View>
                  <View className="h-px bg-zinc-800" />
                  <View className="flex-row items-center justify-between">
                    <Text className="text-[11px] text-zinc-500">
                      מצטרף מאז {formatDate(member.createdAt)}
                    </Text>
                    <Text className="text-[11px] text-emerald-300">
                      {member.isActive ? 'פעיל' : 'מושבת'}
                    </Text>
                  </View>
                </View>
              ))
            )}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
