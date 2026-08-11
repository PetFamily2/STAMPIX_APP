import { Ionicons } from '@expo/vector-icons';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { useMutation } from 'convex/react';
import { router } from 'expo-router';
import { useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  SafeAreaView,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';
import { BackButton } from '@/components/BackButton';
import BusinessScreenHeader from '@/components/BusinessScreenHeader';
import { ContinueButton } from '@/components/ContinueButton';
import StickyScrollHeader from '@/components/StickyScrollHeader';
import { api } from '@/convex/_generated/api';
import { alignItems, flexDirection } from '@/lib/rtl';

const SUPPORT_MESSAGE_MAX_LENGTH = 1200;

const TEXT = {
  title: 'עזרה ותמיכה',
  sectionFaq: 'שאלות ותשובות',
  sectionContact: 'צור קשר',
  messagePlaceholder: 'כתבו כאן מה הבעיה או מה אתם צריכים...',
  send: 'שלחו לשירות לקוחות',
  sending: 'שולח...',
  sentTitle: 'הפנייה נשלחה',
  sentMessage: 'ההודעה שלכם נשמרה וזמינה כעת בפאנל האדמין.',
  errorTitle: 'שגיאה',
  messageRequired: 'כתבו הודעה לפני השליחה.',
  messageTooLong: 'ההודעה ארוכה מדי. נסו לקצר לעד 1200 תווים.',
  sendFailed: 'לא הצלחנו לשלוח את הפנייה. נסו שוב.',
  messageLabel: 'מה תרצו לשלוח לשירות לקוחות?',
  counterSuffix: 'תווים',
};

const FAQ_ITEMS = [
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

function toErrorMessage(error: unknown) {
  if (!(error instanceof Error)) {
    return TEXT.sendFailed;
  }

  switch (error.message) {
    case 'MESSAGE_REQUIRED':
      return TEXT.messageRequired;
    case 'MESSAGE_TOO_LONG':
      return TEXT.messageTooLong;
    default:
      return TEXT.sendFailed;
  }
}

function FaqItem({
  question,
  answer,
  expanded,
  onPress,
}: {
  question: string;
  answer: string;
  expanded: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.faqCard, pressed ? styles.pressed : null]}
    >
      <View style={styles.faqHeader}>
        <Ionicons
          name={expanded ? 'remove-circle-outline' : 'add-circle-outline'}
          size={20}
          color="#2F6BFF"
        />
        <Text style={styles.faqQuestion}>{question}</Text>
      </View>
      {expanded ? <Text style={styles.faqAnswer}>{answer}</Text> : null}
    </Pressable>
  );
}

export default function CustomerHelpSupportScreen() {
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
  const sendSupportRequest = useMutation(api.support.sendSupportRequest);

  const [expandedIndex, setExpandedIndex] = useState<number | null>(0);
  const [message, setMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const trimmedMessage = message.trim();
  const messageLength = message.length;
  const hasMessage = trimmedMessage.length > 0;
  const isMessageTooLong = messageLength > SUPPORT_MESSAGE_MAX_LENGTH;
  const isButtonActive = hasMessage && !isMessageTooLong;
  const isSendDisabled = isSending || !isButtonActive;

  const handleSubmit = async () => {
    try {
      setIsSending(true);
      await sendSupportRequest({ message: trimmedMessage });
      setMessage('');
      Alert.alert(TEXT.sentTitle, TEXT.sentMessage);
    } catch (error) {
      Alert.alert(TEXT.errorTitle, toErrorMessage(error));
    } finally {
      setIsSending(false);
    }
  };

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
          {FAQ_ITEMS.map((item, index) => (
            <FaqItem
              key={item.question}
              question={item.question}
              answer={item.answer}
              expanded={expandedIndex === index}
              onPress={() =>
                setExpandedIndex((current) =>
                  current === index ? null : index
                )
              }
            />
          ))}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{TEXT.sectionContact}</Text>
          <View style={styles.card}>
            <Text style={styles.messageLabel}>{TEXT.messageLabel}</Text>
            <TextInput
              value={message}
              onChangeText={setMessage}
              editable={!isSending}
              placeholder={TEXT.messagePlaceholder}
              placeholderTextColor="#9CA3AF"
              multiline={true}
              textAlignVertical="top"
              style={styles.messageInput}
            />

            <View style={styles.counterRow}>
              <Text
                style={[
                  styles.counterText,
                  isMessageTooLong ? styles.counterTextDanger : null,
                ]}
              >
                {messageLength}/{SUPPORT_MESSAGE_MAX_LENGTH}{' '}
                {TEXT.counterSuffix}
              </Text>
            </View>

            <View style={styles.sendButtonRow}>
              <ContinueButton
                onPress={() => {
                  void handleSubmit();
                }}
                disabled={isSendDisabled}
                label={isSending ? TEXT.sending : TEXT.send}
                accessibilityLabel={TEXT.send}
              />
            </View>
          </View>
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
  pressed: { opacity: 0.88 },

  headerRow: {
    alignItems: 'stretch',
    marginBottom: 4,
  },
  backButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  section: { gap: 10 },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#71717A',
    textAlign: 'right',
  },
  card: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
    padding: 14,
    gap: 12,
  },

  faqCard: {
    borderBottomWidth: 1,
    borderBottomColor: '#D9E2F2',
    paddingHorizontal: 2,
    paddingVertical: 12,
    gap: 10,
  },
  faqHeader: {
    flexDirection: flexDirection.row,
    alignItems: 'center',
    gap: 10,
  },
  faqQuestion: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '800',
    color: '#18181B',
    textAlign: 'right',
  },
  faqAnswer: {
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '500',
    color: '#6B7280',
    textAlign: 'right',
  },

  messageLabel: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '800',
    color: '#18181B',
    textAlign: 'right',
  },
  messageInput: {
    minHeight: 132,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    backgroundColor: '#F9FAFB',
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '500',
    color: '#111827',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  counterRow: {
    alignItems: alignItems.start,
  },
  counterText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#6B7280',
    textAlign: 'right',
  },
  counterTextDanger: {
    color: '#B42318',
  },
  sendButtonRow: {
    marginTop: 4,
    alignItems: 'center',
  },
});
