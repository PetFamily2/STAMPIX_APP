import { useQuery } from 'convex/react'; // ייבוא Hook לביצוע שאילתות מול הדאטה בייס
import { ScrollView, Text, View } from 'react-native'; // רכיבי UI בסיסיים של React Native
import { SafeAreaView } from 'react-native-safe-area-context'; // רכיב שדואג שהתוכן לא יוסתר על ידי ה-Notch או ה-Home Indicator
import { api } from '@/convex/_generated/api'; // ה-API שנוצר אוטומטית על ידי Convex
import { tw } from '@/lib/rtl'; // ספריית עזר לתמיכה ב-RTL (ימין לשמאל)

export default function HomePage() {
  const user = useQuery(api.users.getCurrentUser); // שליפת המשתמש הנוכחי מהשרת

  // תצוגת שם המשתמש (שם מלא או החלק הראשון של האימייל)
  const displayName = user?.fullName || user?.email?.split('@')[0] || 'משתמש';

  return (
    <SafeAreaView className="flex-1 bg-[#0a0a0a]" edges={['top']}>
      <ScrollView className="flex-1">
        <View className="max-w-3xl w-full mx-auto px-8 pb-12 pt-8">
          <Text
            className={`text-[#ededed] text-4xl font-bold mb-3 ${tw.textStart}`}
          >
            ברוכים הבאים
          </Text>
          {user && (
            <Text
              className={`text-[#4fc3f7] text-lg font-medium mb-5 ${tw.textStart}`}
            >
              שלום, {displayName}!
            </Text>
          )}
          <Text
            className={`text-[#ededed] text-base leading-7 ${tw.textStart}`}
          >
            זהו תבנית אפליקציית React Native עם תמיכה מלאה בעברית מימין לשמאל.
            האפליקציה מכילה מערכת ניווט עם שלושה עמודים נוספים, ומספקת נקודת
            התחלה מצוינת לפיתוח יישומים בעברית. הממשק מותאם לכיוון כתיבה מימין
            לשמאל, והטקסט מוצג בצורה נכונה ונוחה לקריאה.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
