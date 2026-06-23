import { useAuthActions } from '@convex-dev/auth/react';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  SafeAreaView,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';
import { BackButton } from '@/components/BackButton';
import BusinessScreenHeader from '@/components/BusinessScreenHeader';
import StickyScrollHeader from '@/components/StickyScrollHeader';
import { UserAvatar } from '@/components/UserAvatar';
import { useSessionContext } from '@/contexts/UserContext';
import { safePush } from '@/lib/navigation';
import { tw } from '@/lib/rtl';

type LegalDocumentKey = 'privacy' | 'terms' | 'deletion';

const LEGAL_ROWS: Array<{
  document: LegalDocumentKey;
  title: string;
  subtitle: string;
  icon: keyof typeof Ionicons.glyphMap;
}> = [
  {
    document: 'terms',
    title: 'תנאי שימוש',
    subtitle: 'כללי השימוש ב-STAMPAIX לעסקים וללקוחות',
    icon: 'document-text-outline',
  },
  {
    document: 'privacy',
    title: 'מדיניות פרטיות',
    subtitle: 'איך נשמר ומנוהל המידע בחשבון',
    icon: 'shield-checkmark-outline',
  },
  {
    document: 'deletion',
    title: 'מדיניות מחיקת חשבון',
    subtitle: 'מידע בלבד: מה נמחק, מה נשמר ומגבלת בעלים יחיד',
    icon: 'information-circle-outline',
  },
];

export default function BusinessSettingsAccountScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const sessionContext = useSessionContext();
  const { signOut } = useAuthActions();
  const [isSigningOut, setIsSigningOut] = useState(false);

  const user = sessionContext?.user;
  const userFullName =
    user?.fullName?.trim() ||
    [user?.firstName?.trim(), user?.lastName?.trim()]
      .filter(Boolean)
      .join(' ')
      .trim() ||
    'ללא שם';

  const handleSignOut = async () => {
    if (isSigningOut) {
      return;
    }

    try {
      setIsSigningOut(true);
      await signOut();
      router.replace('/(auth)/sign-in');
    } catch {
      Alert.alert('שגיאה', 'לא הצלחנו לבצע יציאה. נסו שוב.');
    } finally {
      setIsSigningOut(false);
    }
  };

  const openLegalDocument = (document: LegalDocumentKey) => {
    safePush(`/(authenticated)/settings-legal?document=${document}`);
  };

  return (
    <SafeAreaView className="flex-1 bg-[#E9F0FF]" edges={[]}>
      <ScrollView
        stickyHeaderIndices={[0]}
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingBottom: 30,
          gap: 12,
        }}
      >
        <StickyScrollHeader
          topPadding={(insets.top || 0) + 12}
          backgroundColor="#E9F0FF"
        >
          <BusinessScreenHeader
            title="פרטי חשבון"
            subtitle="נתוני המשתמש המחובר והגדרות התחברות"
            titleAccessory={<BackButton onPress={() => router.back()} />}
          />
        </StickyScrollHeader>

        <View className="rounded-3xl border border-[#E3E9FF] bg-white p-5">
          <Text
            className={`text-[11px] font-semibold text-[#64748B] ${tw.textStart}`}
          >
            חשבון משתמש
          </Text>

          <View className="mt-4 flex-row items-center gap-3 border-b border-[#F1F5F9] pb-4">
            <UserAvatar
              avatarUrl={user?.avatarUrl}
              fullName={userFullName}
              size={68}
            />
            <View className="flex-1 items-end gap-1">
              <Text className="text-right text-[18px] font-black text-[#111827]">
                {userFullName}
              </Text>
              <Text className="text-right text-xs font-semibold text-[#64748B]">
                {user?.email || '׳׳ ׳׳•׳’׳“׳¨'}
              </Text>
            </View>
          </View>

          <View className="mt-4 gap-3">
            <View className={`${tw.flexRow} items-center justify-between`}>
              <Text className="text-sm font-bold text-[#1A2B4A]">
                {userFullName}
              </Text>
              <Text className="text-xs text-[#64748B]">שם מלא</Text>
            </View>
            <View className={`${tw.flexRow} items-center justify-between`}>
              <Text className="text-sm font-bold text-[#1A2B4A]">
                {user?.email || 'לא מוגדר'}
              </Text>
              <Text className="text-xs text-[#64748B]">אימייל</Text>
            </View>
            <View className={`${tw.flexRow} items-center justify-between`}>
              <Text className="text-sm font-bold text-[#1A2B4A]">
                {user?.phone || 'לא מוגדר'}
              </Text>
              <Text className="text-xs text-[#64748B]">טלפון</Text>
            </View>
          </View>
        </View>

        <View className="gap-3 rounded-3xl border border-[#E3E9FF] bg-white p-4">
          <Text
            className={`text-[11px] font-semibold text-[#64748B] ${tw.textStart}`}
          >
            מסמכים ומדיניות
          </Text>

          {LEGAL_ROWS.map((row) => (
            <Pressable
              key={row.document}
              onPress={() => openLegalDocument(row.document)}
              style={({ pressed }) => [
                {
                  borderRadius: 18,
                  borderWidth: 1,
                  borderColor: '#E3E9FF',
                  backgroundColor: '#FFFFFF',
                  paddingHorizontal: 14,
                  paddingVertical: 14,
                  opacity: pressed ? 0.88 : 1,
                },
              ]}
            >
              <View className="flex-row items-center justify-between gap-3">
                <View className="h-[38px] w-[38px] items-center justify-center rounded-full border border-[#DCE6FF] bg-[#EEF3FF]">
                  <Ionicons name={row.icon} size={18} color="#1D4ED8" />
                </View>

                <View className="flex-1 items-end">
                  <Text className="text-right text-[15px] font-extrabold text-[#111827]">
                    {row.title}
                  </Text>
                  <Text className="mt-1 text-right text-xs font-medium text-[#64748B]">
                    {row.subtitle}
                  </Text>
                </View>

                <Ionicons name="chevron-back" size={18} color="#94A3B8" />
              </View>
            </Pressable>
          ))}
        </View>

        <TouchableOpacity
          onPress={() => {
            void handleSignOut();
          }}
          disabled={isSigningOut}
          className={`rounded-2xl px-4 py-3 ${
            isSigningOut ? 'bg-[#FCA5A5]' : 'bg-[#DC2626]'
          }`}
        >
          {isSigningOut ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text className="text-center text-sm font-bold text-white">
              יציאה מהחשבון
            </Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}
