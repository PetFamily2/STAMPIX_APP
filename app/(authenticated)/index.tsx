import { useQuery } from 'convex/react';
import { ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { api } from '@/convex/_generated/api';
import type { Doc } from '@/convex/_generated/dataModel';
import { tw } from '@/lib/rtl';

const TEXT = {
  title: '\u05d1\u05e8\u05d5\u05db\u05d9\u05dd \u05d4\u05d1\u05d0\u05d9\u05dd',
  hello: '\u05e9\u05dc\u05d5\u05dd',
  fallbackUser: '\u05de\u05e9\u05ea\u05de\u05e9',
  description:
    '\u05d4\u05de\u05e2\u05e8\u05db\u05ea \u05de\u05d5\u05db\u05e0\u05d4 \u05dc\u05d4\u05de\u05e9\u05da \u05e2\u05d1\u05d5\u05d3\u05d4. \u05d1\u05d7\u05e8\u05d5 \u05de\u05e1\u05dc\u05d5\u05dc \u05de\u05d4\u05ea\u05e4\u05e8\u05d9\u05d8 \u05db\u05d3\u05d9 \u05dc\u05e0\u05d4\u05dc \u05db\u05e8\u05d8\u05d9\u05e1\u05d9\u05d5\u05ea, \u05d4\u05d8\u05d1\u05d5\u05ea \u05d5\u05e0\u05ea\u05d5\u05e0\u05d9\u05dd.',
};

export default function HomePage() {
  const user = useQuery(api.users.getCurrentUser) as Doc<'users'> | null;
  const displayName =
    user?.fullName || user?.email?.split('@')[0] || TEXT.fallbackUser;

  return (
    <SafeAreaView className="flex-1 bg-[#E9F0FF]" edges={[]}>
      <ScrollView className="flex-1">
        <View className="max-w-3xl w-full mx-auto px-8 pb-12 pt-8">
          <Text
            className={`text-[#1A2B4A] text-4xl font-bold mb-3 ${tw.textStart}`}
          >
            {TEXT.title}
          </Text>
          {user ? (
            <Text
              className={`text-[#2F6BFF] text-lg font-medium mb-5 ${tw.textStart}`}
            >
              {TEXT.hello}, {displayName}!
            </Text>
          ) : null}
          <Text
            className={`text-[#1A2B4A] text-base leading-7 ${tw.textStart}`}
          >
            {TEXT.description}
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
