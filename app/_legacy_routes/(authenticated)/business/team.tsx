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
    if (isAppModeLoading) return;
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
      setInviteError('׳‘׳—׳¨ ׳¢׳¡׳§ ׳₪׳¢׳™׳ ׳׳₪׳ ׳™ ׳”׳–׳׳ ׳”');
      return;
    }
    if (!inviteEmail.trim()) {
      setInviteError('׳”׳–׳ ׳›׳×׳•׳‘׳× ׳׳™׳׳™׳™׳ ׳×׳§׳™׳ ׳”');
      return;
    }
    if (!isOwner) {
      setInviteError('׳¨׳§ ׳‘׳¢׳ ׳”׳¢׳¡׳§ ׳™׳›׳•׳ ׳׳”׳–׳׳™׳ ׳¢׳•׳‘׳“׳™׳');
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
      setInviteSuccess('׳”׳”׳–׳׳ ׳” ׳ ׳©׳׳—׳” ׳‘׳”׳¦׳׳—׳”!');
      setInviteEmail('');
    } catch (error: unknown) {
      setInviteError(
        (error as Error).message ?? '׳׳™׳¨׳¢׳” ׳©׳’׳™׳׳” ׳‘׳”׳–׳׳ ׳”'
      );
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
              onPress={() =>
                safeBack('/(authenticated)/(business)/business/dashboard')
              }
            />
            <Text className={`text-white text-2xl font-bold ${tw.textStart}`}>
              ניהול צוות עובדים
            </Text>
            <View className="w-11 h-11" />
          </View>

          <Text className={`text-zinc-400 text-xs ${tw.textStart}`}>
            ׳”׳•׳¡׳£ ׳—׳‘׳¨׳™ ׳¦׳•׳•׳× ׳¢׳ ׳”׳¨׳©׳׳•׳× ׳¡׳¨׳™׳§׳” ׳•׳¨׳©׳/׳™
            ׳”׳™׳¡׳˜׳•׳¨׳™׳™׳× ׳₪׳¢׳™׳׳•׳×.
          </Text>

          <View className="rounded-3xl border border-zinc-800 bg-zinc-950 p-5 space-y-3">
            <Text
              className={`text-[10px] uppercase tracking-[0.4em] text-zinc-500 ${tw.textStart}`}
            >
              ׳‘׳—׳¨ ׳¢׳¡׳§
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
              ׳”׳–׳׳ ׳¢׳•׳‘׳“ ׳—׳“׳©
            </Text>
            <TextInput
              value={inviteEmail}
              onChangeText={(text) => setInviteEmail(text)}
              placeholder="׳׳™׳׳™׳™׳ ׳”׳¢׳•׳‘׳“"
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
                  ׳©׳׳— ׳”׳–׳׳ ׳”
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
                ׳¨׳§ ׳‘׳¢׳ ׳”׳¢׳¡׳§ ׳™׳›׳•׳ ׳׳”׳–׳׳™׳ ׳¢׳•׳‘׳“׳™׳ ׳—׳“׳©׳™׳.
              </Text>
            )}
          </View>

          <View className="space-y-4">
            <View className="flex-row items-center justify-between">
              <Text
                className={`text-[10px] uppercase tracking-[0.4em] text-zinc-500 ${tw.textStart}`}
              >
                ׳¦׳•׳•׳× ׳₪׳¢׳™׳
              </Text>
              <Text className="text-xs text-zinc-500">
                {staffMembers
                  ? staffList.length
                    ? `${staffList.length} ׳—׳‘׳¨׳™׳`
                    : '׳׳™׳ ׳¢׳•׳‘׳“׳™׳'
                  : '׳˜׳•׳¢׳...'}
              </Text>
            </View>
            {staffMembers === undefined ? (
              <ActivityIndicator color="#4fc3f7" />
            ) : staffList.length === 0 ? (
              <View className="rounded-2xl border border-dashed border-zinc-800 px-4 py-6 items-center">
                <Text className="text-sm text-zinc-500 text-center">
                  ׳׳™׳ ׳¢׳“׳™׳™׳ ׳¢׳•׳‘׳“׳™׳ ׳©׳׳—׳•׳‘׳¨׳™׳ ׳׳¢׳¡׳§ ׳”׳ ׳‘׳—׳¨.
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
                        {member.email ?? '׳׳™׳׳™׳™׳ ׳׳ ׳׳•׳’׳“׳¨'}
                      </Text>
                    </View>
                    <View className="items-end">
                      <Text className="text-[10px] font-bold uppercase tracking-[0.3em] text-zinc-500">
                        {member.staffRole === 'owner' ? '׳‘׳¢׳׳™׳' : '׳¢׳•׳‘׳“'}
                      </Text>
                      <Text className="text-[11px] text-zinc-400">
                        {member.role ?? '׳׳™׳ ׳×׳₪׳§׳™׳“'}
                      </Text>
                    </View>
                  </View>
                  <View className="h-px bg-zinc-800" />
                  <View className="flex-row items-center justify-between">
                    <Text className="text-[11px] text-zinc-500">
                      ׳׳¦׳˜׳¨׳£ ׳׳׳– {formatDate(member.createdAt)}
                    </Text>
                    <Text className="text-[11px] text-emerald-300">
                      {member.isActive ? '׳₪׳¢׳™׳' : '׳׳•׳©׳‘׳×'}
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
