import { useLocalSearchParams, useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { StandaloneBackTitleHeader } from '@/components/StandaloneBackTitleHeader';
import StickyScrollHeader from '@/components/StickyScrollHeader';
import { PRIVACY_POLICY_URL, TERMS_OF_SERVICE_URL } from '@/config/legalUrls';
import { safeBack } from '@/lib/navigation';
import { flexDirection } from '@/lib/rtl';

type LegalDocumentKey = 'privacy' | 'terms' | 'deletion';

type LegalSection = {
  title: string;
  body: string[];
  tone?: 'warning';
};

type LegalDocument = {
  key: LegalDocumentKey;
  tabLabel: string;
  title: string;
  subtitle: string;
  updatedAt: string;
  sections: LegalSection[];
};

const DOCUMENT_ORDER: LegalDocumentKey[] = ['privacy', 'terms', 'deletion'];

const LEGAL_DOCUMENTS: Record<LegalDocumentKey, LegalDocument> = {
  privacy: {
    key: 'privacy',
    tabLabel: 'פרטיות',
    title: 'מדיניות פרטיות',
    subtitle: 'איך STAMPAIX אוספת, משתמשת ושומרת מידע באפליקציה.',
    updatedAt: '20.06.2026',
    sections: [
      {
        title: 'איזה מידע נאסף',
        body: [
          'פרטי חשבון וזיהוי: שם, אימייל או טלפון, מזהי משתמש פנימיים ופרטי אימות הנדרשים להתחברות.',
          'פעילות נאמנות: כרטיסיות, ניקובים, מימושים, סריקות QR, שיוך לעסק, מבצעים והיסטוריית פעולות.',
          'מידע עסקי: פרופיל עסק, אנשי צוות, הרשאות, תוכן שהעסק מזין, תמונות עסקיות ותנאי הטבות.',
          'מידע טכני ותפעולי: סוג מכשיר, מערכת הפעלה, לוגים, תקלות, אירועי אבטחה ומזהי התראות Push.',
          'מיקום, מצלמה ותמונות נאספים רק כאשר המשתמש מפעיל יכולת שדורשת הרשאה מתאימה, כמו גילוי עסקים קרובים, סריקת QR או העלאת תמונה עסקית.',
        ],
      },
      {
        title: 'למה משתמשים במידע',
        body: [
          'כדי להפעיל את החשבון, לאפשר צבירה ומימוש הטבות, להציג ארנק לקוח ולנהל עסקים, מבצעים וצוותים.',
          'כדי לאבטח את השירות, למנוע הונאה, לאתר תקלות, לספק תמיכה ולשמור תיעוד נדרש.',
          'כדי לשלוח הודעות שירות והתראות, ובכפוף להסכמה מתאימה גם עדכונים שיווקיים בתוך ערוצי המוצר.',
          'כדי לשפר את המוצר באמצעות מדדים מצרפיים או אנונימיים ככל שניתן.',
        ],
      },
      {
        title: 'שיתוף עם ספקים',
        body: [
          'מידע עשוי להימסר לספקי תשתית הנדרשים להפעלת המוצר, כולל אימות חשבון, התראות, מפות ומיקום, תשלומים כאשר הם פעילים, אימייל, ניטור ותמיכה.',
          'המידע משותף לפי הצורך התפעולי בלבד. STAMPAIX אינה מוכרת מידע אישי לצדדים שלישיים לצורכי פרסום שלהם.',
          'מידע עשוי להימסר אם קיימת חובה חוקית, צו, דרישת רגולטור, צורך אבטחתי או הגנה מפני שימוש לרעה.',
        ],
      },
      {
        title: 'בחירות ושליטה',
        body: [
          'ניתן לנהל התראות ודיוור שיווקי במסך ההגדרות ובמערכת ההפעלה של המכשיר.',
          'ניתן לבטל הרשאות מצלמה, מיקום ותמונות דרך הגדרות המכשיר. ביטול הרשאה עשוי להגביל יכולות שתלויות בה.',
          'ניתן לפתוח תהליך מחיקת חשבון מתוך ההגדרות. חלק מהמידע עשוי להישמר או לעבור אנונימיזציה כאשר הדבר נדרש לצורכי אבטחה, מניעת הונאה, תיעוד חיובים או חובה חוקית.',
        ],
      },
    ],
  },
  terms: {
    key: 'terms',
    tabLabel: 'תנאים',
    title: 'תנאי שימוש',
    subtitle: 'כללי השימוש ב-STAMPAIX ללקוחות, עסקים ואנשי צוות.',
    updatedAt: '20.06.2026',
    sections: [
      {
        title: 'מהות השירות',
        body: [
          'STAMPAIX מספקת פלטפורמה דיגיטלית לנאמנות לקוחות, כרטיסיות, ניקובים, מבצעים, סריקות QR וניהול צוותים.',
          'הפלטפורמה היא ספקית טכנולוגיה. העסק אחראי לתוכן העסקי, לתנאי ההטבות, למימוש בפועל, למחירים, לשירות הלקוחות ולעמידה בדין הצרכני הרלוונטי.',
        ],
      },
      {
        title: 'חשבון ואבטחה',
        body: [
          'השימוש בשירות עשוי לדרוש הרשמה, אימות וזיהוי משתמש. המשתמש אחראי למסור פרטים נכונים ולשמור על גישה מאובטחת לחשבון.',
          'אסור לבצע הונאה, ניקובים פיקטיביים, עקיפת מנגנוני תשלום או אבטחה, שימוש אוטומטי בלתי מורשה, פגיעה במשתמשים אחרים או העלאת תוכן מטעה, מפר זכויות או בלתי חוקי.',
        ],
      },
      {
        title: 'עסקים, הטבות ומבצעים',
        body: [
          'עסק שמפעיל תוכנית נאמנות אחראי להגדיר תנאי צבירה ומימוש ברורים, לעדכן אותם לפי דין ולהכשיר עובדים שמשתמשים בסורק או במסכי הניהול.',
          'STAMPAIX רשאית לתקן נתונים או להגביל שימוש כאשר קיימת תקלה, חשד להונאה, הפרת תנאים או צורך אבטחתי.',
        ],
      },
      {
        title: 'תשלומים ומנויים',
        body: [
          'כאשר מערכת התשלומים פעילה, מסלולים, מחירים, מחזורי חיוב והטבות יוצגו לפני רכישה. רכישות וניהול מנויים עשויים להתבצע דרך ספקי תשלום מאובטחים או חנויות האפליקציות.',
          'החזרים, ביטולים ושינויים כפופים לתנאים המוצגים בזמן הרכישה, למדיניות החנות הרלוונטית ולדין החל.',
        ],
      },
      {
        title: 'זכויות ועדכונים',
        body: [
          'כל הזכויות באפליקציה, בממשקים ובקוד שייכות ל-STAMPAIX או לבעלי הרישיון שלה. העסק שומר על זכויותיו בתוכן שהזין, אך נותן רישיון להשתמש בו לצורך מתן השירות.',
          'התנאים עשויים להתעדכן מעת לעת. תאריך העדכון יופיע במסמך, והמשך שימוש לאחר עדכון מהווה הסכמה לתנאים המעודכנים ככל שהדין מאפשר.',
        ],
      },
    ],
  },
  deletion: {
    key: 'deletion',
    tabLabel: 'מחיקה',
    title: 'מחיקת חשבון',
    subtitle: 'מה קורה כאשר מבקשים למחוק חשבון מתוך האפליקציה.',
    updatedAt: '20.06.2026',
    sections: [
      {
        title: 'איך מוחקים חשבון',
        body: [
          'מתוך מסך ההגדרות בוחרים "מחיקת חשבון", קוראים את האזהרה, ממשיכים לשלב האישור ומקלידים DELETE כדי לאשר פעולה בלתי הפיכה.',
          'המחיקה באפליקציה מפעילה את מנגנון המחיקה הקיים בלבד: deleteMyAccountHard. אין מסלול מחיקה חלופי במסך זה.',
        ],
        tone: 'warning',
      },
      {
        title: 'מה נמחק ומה נשמר',
        body: [
          'המערכת מוחקת את החשבון ואת הנתונים המשויכים אליו בהתאם לכללי המחיקה הקיימים במוצר, ולאחר מכן מנקה את מצב ההתחברות המקומי במכשיר.',
          'מידע מצרפי, אנונימי, אבטחתי, חשבונאי, תיעוד חיובים או מידע הנדרש לפי דין עשוי להישמר גם לאחר מחיקה.',
          'פעולות היסטוריות שקשורות לעסק, למבצע או למניעת הונאה עשויות להישמר בצורה מצומצמת או לא מזהה, כדי לא לפגוע בתקינות רשומות עסקיות.',
        ],
      },
      {
        title: 'מגבלת בעלים יחיד',
        body: [
          'אם החשבון הוא הבעלים הפעיל היחיד של עסק, המחיקה נחסמת כדי לא להשאיר עסק ללא בעלים. במקרה כזה יש להעביר בעלות או לטפל בעסק לפני מחיקת החשבון.',
          'החסימה הזו היא חלק מכללי הבטיחות הקיימים של deleteMyAccountHard ולא השתנתה במסכי המדיניות.',
        ],
      },
      {
        title: 'לפני אישור סופי',
        body: [
          'מחיקת חשבון היא פעולה בלתי הפיכה. לאחר השלמתה ייתכן שלא ניתן יהיה לשחזר ארנק, כרטיסיות, הרשאות עסק, היסטוריית פעילות או העדפות.',
          'אם יש שאלה על מחיקה או זכויות מידע, יש לפנות דרך מסך העזרה והתמיכה באפליקציה עד לפרסום כתובת תמיכה ציבורית קבועה.',
        ],
      },
    ],
  },
};

function normalizeDocumentKey(value: unknown): LegalDocumentKey {
  const rawValue = Array.isArray(value) ? value[0] : value;
  if (
    rawValue === 'privacy' ||
    rawValue === 'terms' ||
    rawValue === 'deletion'
  ) {
    return rawValue;
  }
  return 'privacy';
}

export function LegalDocumentScreen({
  fallbackHref,
}: {
  fallbackHref: string;
}) {
  const router = useRouter();
  const params = useLocalSearchParams<{ document?: string | string[] }>();
  const activeKey = normalizeDocumentKey(params.document);
  const activeDocument = LEGAL_DOCUMENTS[activeKey];

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        stickyHeaderIndices={[0]}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <StickyScrollHeader
          topPadding={0}
          backgroundColor="#F8F7F4"
          style={styles.titleShell}
        >
          <Text style={styles.eyebrow}>מסמכים משפטיים</Text>
          <StandaloneBackTitleHeader
            title={activeDocument.title}
            subtitle={activeDocument.subtitle}
            onBackPress={() => safeBack(fallbackHref)}
            titleStyle={styles.title}
            subtitleStyle={styles.subtitle}
          />

          <View style={styles.tabs}>
            {DOCUMENT_ORDER.map((key) => {
              const document = LEGAL_DOCUMENTS[key];
              const selected = key === activeKey;
              return (
                <Pressable
                  key={key}
                  accessibilityRole="tab"
                  accessibilityState={{ selected }}
                  onPress={() => router.setParams({ document: key })}
                  style={[styles.tab, selected ? styles.tabSelected : null]}
                >
                  <Text
                    style={[
                      styles.tabText,
                      selected ? styles.tabTextSelected : null,
                    ]}
                  >
                    {document.tabLabel}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </StickyScrollHeader>

        <View style={styles.updatedCard}>
          <Text style={styles.updatedText}>
            עודכן לאחרונה: {activeDocument.updatedAt}
          </Text>
          <Text style={styles.updatedText}>
            המסמך מוצג בתוך האפליקציה כגרסת fallback עד לפרסום כתובות ציבוריות
            חיות.
          </Text>
        </View>

        <View style={styles.sections}>
          {activeDocument.sections.map((section) => (
            <View
              key={section.title}
              style={[
                styles.sectionCard,
                section.tone === 'warning' ? styles.warningCard : null,
              ]}
            >
              <Text style={styles.sectionTitle}>{section.title}</Text>
              {section.body.map((paragraph) => (
                <Text key={paragraph} style={styles.paragraph}>
                  {paragraph}
                </Text>
              ))}
            </View>
          ))}
        </View>

        <View style={styles.externalCard}>
          <Text style={styles.externalTitle}>
            קישורים ציבוריים נדרשים לפרסום
          </Text>
          <Text style={styles.paragraph}>
            חנויות האפליקציות דורשות קישורים ציבוריים חיים למדיניות פרטיות
            ולתנאי שימוש. אין להסתמך על מסך fallback פנימי במקום עמודים ציבוריים
            לפני הגשה לחנויות.
          </Text>
          <Text selectable={true} style={styles.urlText}>
            Privacy: {PRIVACY_POLICY_URL}
          </Text>
          <Text selectable={true} style={styles.urlText}>
            Terms: {TERMS_OF_SERVICE_URL}
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F7F4',
  },
  titleShell: {
    paddingBottom: 12,
  },
  content: {
    paddingHorizontal: 20,
    paddingBottom: 32,
    width: '100%',
    maxWidth: 760,
    alignSelf: 'center',
  },
  eyebrow: {
    color: '#6B7280',
    fontSize: 12,
    fontWeight: '800',
    marginBottom: 6,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  title: {
    color: '#111827',
    fontSize: 24,
    fontWeight: '900',
    lineHeight: 31,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  subtitle: {
    color: '#4B5563',
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 20,
    marginTop: 6,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  tabs: {
    backgroundColor: '#E5E7EB',
    borderRadius: 14,
    flexDirection: flexDirection.row,
    gap: 4,
    marginTop: 14,
    padding: 4,
  },
  tab: {
    alignItems: 'center',
    borderRadius: 10,
    flex: 1,
    justifyContent: 'center',
    minHeight: 40,
    paddingHorizontal: 8,
  },
  tabSelected: {
    backgroundColor: '#FFFFFF',
  },
  tabText: {
    color: '#6B7280',
    fontSize: 12,
    fontWeight: '800',
    textAlign: 'center',
    writingDirection: 'rtl',
  },
  tabTextSelected: {
    color: '#111827',
  },
  updatedCard: {
    backgroundColor: '#EEF6FF',
    borderColor: '#BFDBFE',
    borderRadius: 14,
    borderWidth: 1,
    gap: 4,
    marginTop: 4,
    padding: 14,
  },
  updatedText: {
    color: '#1E3A8A',
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 18,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  sections: {
    gap: 12,
    marginTop: 14,
  },
  sectionCard: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E5E7EB',
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
  },
  warningCard: {
    backgroundColor: '#FEF3F2',
    borderColor: '#FDA29B',
  },
  sectionTitle: {
    color: '#111827',
    fontSize: 16,
    fontWeight: '900',
    marginBottom: 8,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  paragraph: {
    color: '#374151',
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 21,
    marginTop: 6,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  externalCard: {
    backgroundColor: '#FFFBEB',
    borderColor: '#FDE68A',
    borderRadius: 16,
    borderWidth: 1,
    marginTop: 14,
    padding: 16,
  },
  externalTitle: {
    color: '#92400E',
    fontSize: 15,
    fontWeight: '900',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  urlText: {
    color: '#1D4ED8',
    fontSize: 12,
    fontWeight: '800',
    lineHeight: 19,
    marginTop: 8,
    textAlign: 'left',
    writingDirection: 'ltr',
  },
});
