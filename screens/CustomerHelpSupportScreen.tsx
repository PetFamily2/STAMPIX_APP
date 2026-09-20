import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  SafeAreaView,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';
import { BackButton } from '@/components/BackButton';
import BusinessScreenHeader from '@/components/BusinessScreenHeader';
import { FaqAccordion, type FaqItemData } from '@/components/help/FaqAccordion';
import { SupportMessageForm } from '@/components/help/SupportMessageForm';
import { SupportWhatsAppButton } from '@/components/help/SupportWhatsAppButton';
import StickyScrollHeader from '@/components/StickyScrollHeader';
import { SUPPORT_CONTACT_COPY } from '@/lib/help/supportContact';

const TEXT = {
  title: 'עזרה ותמיכה',
  sectionFaq: 'שאלות ותשובות',
};

const FAQ_ITEMS: FaqItemData[] = [
  {
    question: 'איך מוצאים את כל הכרטיסיות שלי?',
    answer: 'בלשונית הארנק תראו את כל הכרטיסיות, הניקובים והתקדמות שלכם.',
  },
  {
    question: 'איפה אני רואה הטבות זמינות?',
    answer:
      'בלשונית הטבות תראו את כל המימושים והקופונים הפעילים שנצברו בחשבון.',
  },
  {
    question: 'איך מעדכנים טלפון או פרטי חשבון?',
    answer: 'במסך פרטי החשבון אפשר לעדכן טלפון ולבדוק את פרטי המשתמש.',
  },
  {
    question: 'מה לעשות אם כרטיס לא מתעדכן?',
    answer:
      'רעננו את המסך או המתינו שניות בודדות. אם הבעיה ממשיכה, שלחו מכאן פנייה לשירות לקוחות.',
  },
];

export default function CustomerHelpSupportScreen() {
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
  const [expandedIndex, setExpandedIndex] = useState<number | null>(0);

  return (
    <SafeAreaView style={styles.safeArea} edges={[]}>
      <ScrollView
        stickyHeaderIndices={[0]}
        contentContainerStyle={[
          styles.scrollContent,
          {
            paddingBottom: tabBarHeight + 24,
          },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <StickyScrollHeader
          topPadding={(insets.top || 0) + 12}
          backgroundColor="#E9F0FF"
          style={styles.headerRow}
        >
          <BusinessScreenHeader
            title={TEXT.title}
            titleAccessory={<BackButton onPress={() => router.back()} />}
          />
        </StickyScrollHeader>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{TEXT.sectionFaq}</Text>
          <FaqAccordion
            variant="customer"
            items={FAQ_ITEMS}
            expandedIndex={expandedIndex}
            onToggle={(index) =>
              setExpandedIndex((current) => (current === index ? null : index))
            }
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            {SUPPORT_CONTACT_COPY.sectionContact}
          </Text>
          <SupportMessageForm variant="customer" />
          <SupportWhatsAppButton variant="customer" />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#E9F0FF' },
  scrollContent: {
    paddingHorizontal: 20,
    gap: 10,
    width: '100%',
    maxWidth: 720,
    alignSelf: 'center',
  },
  headerRow: {
    alignItems: 'stretch',
    marginBottom: 4,
  },
  section: { gap: 10 },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#71717A',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
});
