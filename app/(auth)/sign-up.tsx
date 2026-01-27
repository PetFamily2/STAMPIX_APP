import { Link, useLocalSearchParams, useRouter } from 'expo-router';
import { Heart, TrendingUp } from 'lucide-react-native';
import { Image, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PreviewModeBanner } from '@/components/PreviewModeBanner';
import { IS_DEV_MODE } from '@/config/appConfig';
import { safeBack } from '@/lib/navigation';
import stampixLogo from '@/reference-ui/stampix---loyalty-made-simple/logo.png';

export default function SignUpScreen() {
  const router = useRouter();
  const { preview } = useLocalSearchParams<{ preview?: string }>();
  const isPreviewMode = IS_DEV_MODE && preview === 'true';

  const handleGetStarted = () => {
    // Navigate to actual sign up form or next step
    router.push('/(auth)/onboarding-client-role');
  };

  return (
    <SafeAreaView className="flex-1 bg-white">
      {/* כפתור יציאה במצב תצוגה מקדימה */}
      {isPreviewMode && <PreviewModeBanner onClose={() => safeBack()} />}

      <View className="flex-1 px-6 py-8">
        {/* Logo */}
        <View className="items-center mb-10 mt-2">
          <View className="relative items-center justify-center">
            <View className="absolute w-24 h-24 rounded-full bg-blue-50" />
            <View className="absolute w-32 h-32 rounded-full bg-blue-100/50" />
            <Image
              source={stampixLogo}
              className="w-24 h-24"
              resizeMode="contain"
              accessibilityLabel="לוגו Stampix"
            />
          </View>
        </View>

        {/* Main Title */}
        <View className="mb-8">
          <Text className="text-[34px] font-black text-gray-900 text-center mb-1">
            העסק והלקוחות
          </Text>
          <Text className="text-[34px] font-black text-center mb-3">
            <Text className="text-gray-900">נפגשים</Text>{' '}
            <Text className="text-gray-900">ב</Text>
            <Text className="text-blue-600">דיגיטל</Text>
          </Text>
          <Text className="text-base text-gray-500 text-center leading-6">
            מצטרפים למהפכה הדיגיטלית.{"\n"}כל הכרטיסיות בכיס אחד, ב-QR.
          </Text>
        </View>

        {/* Feature Cards */}
        <View className="mb-auto">
          {/* Feature 1 - Customer Engagement */}
          <View className="bg-white rounded-2xl p-4 mb-4 border border-gray-200 shadow-sm shadow-gray-200">
            <View className="flex-row items-start gap-4">
              <View className="w-11 h-11 bg-blue-50 rounded-xl items-center justify-center border border-blue-100">
                <Heart size={24} color="#2563eb" fill="#dbeafe" />
              </View>
              <View className="flex-1">
                <Text className="text-base font-extrabold text-gray-900 mb-1 text-right">
                  ללקוחות שאוהבים לקבל
                </Text>
                <Text className="text-sm text-gray-500 text-right leading-5">
                  צוברים חתימות, עוקבים אחרי ההטבות ומקבלים מתנות מהעסקים.
                </Text>
              </View>
            </View>
          </View>

          {/* Feature 2 - Business Growth */}
          <View className="bg-white rounded-2xl p-4 border border-gray-200 shadow-sm shadow-gray-200">
            <View className="flex-row items-start gap-4">
              <View className="w-11 h-11 bg-blue-50 rounded-xl items-center justify-center border border-blue-100">
                <TrendingUp size={24} color="#2563eb" />
              </View>
              <View className="flex-1">
                <Text className="text-base font-extrabold text-gray-900 mb-1 text-right">
                  לעסקים שרוצים לגדול
                </Text>
                <Text className="text-sm text-gray-500 text-right leading-5">
                  מנהלים מועדון לקוחות חכם, מודדים מדדים ברורים ומשתמשים בכלי שיווק.
                </Text>
              </View>
            </View>
          </View>
        </View>

        {/* Bottom Section */}
        <View className="mt-10">
          {/* Get Started Button */}
          <TouchableOpacity
            className="bg-blue-600 rounded-full px-10 py-4 items-center mb-4 shadow-[0_10px_30px_rgba(37,99,235,0.25)]"
            onPress={handleGetStarted}
            activeOpacity={0.8}
          >
            <Text className="text-white text-lg font-bold">בואו נתחיל</Text>
          </TouchableOpacity>

          {/* Sign In Link */}
          <View className="flex-row justify-center items-center gap-2">
            <Link href="/(auth)/sign-in" asChild={true}>
              <TouchableOpacity>
                <Text className="text-blue-600 font-semibold text-base">
                  התחברו כאן
                </Text>
              </TouchableOpacity>
            </Link>
            <Text className="text-gray-500 text-base">כבר יש לכם חשבון?</Text>
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
}


