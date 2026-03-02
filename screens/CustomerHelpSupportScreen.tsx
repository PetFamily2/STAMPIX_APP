import { Ionicons } from '@expo/vector-icons';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { useMutation } from 'convex/react';
import { router } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
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

import { api } from '@/convex/_generated/api';

const SUPPORT_MESSAGE_MAX_LENGTH = 1200;

const TEXT = {
  title: '\u05e2\u05d6\u05e8\u05d4 \u05d5\u05ea\u05de\u05d9\u05db\u05d4',
  sectionFaq:
    '\u05e9\u05d0\u05dc\u05d5\u05ea \u05d5\u05ea\u05e9\u05d5\u05d1\u05d5\u05ea',
  sectionContact: '\u05e6\u05d5\u05e8 \u05e7\u05e9\u05e8',
  messagePlaceholder:
    '\u05db\u05ea\u05d1\u05d5 \u05db\u05d0\u05df \u05de\u05d4 \u05d4\u05d1\u05e2\u05d9\u05d4 \u05d0\u05d5 \u05de\u05d4 \u05d0\u05ea\u05dd \u05e6\u05e8\u05d9\u05db\u05d9\u05dd...',
  send: '\u05e9\u05dc\u05d7\u05d5 \u05dc\u05e9\u05d9\u05e8\u05d5\u05ea \u05dc\u05e7\u05d5\u05d7\u05d5\u05ea',
  sentTitle:
    '\u05d4\u05e4\u05e0\u05d9\u05d9\u05d4 \u05e0\u05e9\u05dc\u05d7\u05d4',
  sentMessage:
    '\u05d4\u05d4\u05d5\u05d3\u05e2\u05d4 \u05e9\u05dc\u05db\u05dd \u05e0\u05e9\u05de\u05e8\u05d4 \u05d5\u05d6\u05de\u05d9\u05e0\u05d4 \u05db\u05e2\u05ea \u05d1\u05e4\u05d0\u05e0\u05dc \u05d4\u05d0\u05d3\u05de\u05d9\u05df.',
  errorTitle: '\u05e9\u05d2\u05d9\u05d0\u05d4',
  messageRequired:
    '\u05db\u05ea\u05d1\u05d5 \u05d4\u05d5\u05d3\u05e2\u05d4 \u05dc\u05e4\u05e0\u05d9 \u05d4\u05e9\u05dc\u05d9\u05d7\u05d4.',
  messageTooLong:
    '\u05d4\u05d4\u05d5\u05d3\u05e2\u05d4 \u05d0\u05e8\u05d5\u05db\u05d4 \u05de\u05d3\u05d9. \u05e0\u05e1\u05d5 \u05dc\u05e7\u05e6\u05e8 \u05dc\u05e2\u05d3 1200 \u05ea\u05d5\u05d5\u05d9\u05dd.',
  sendFailed:
    '\u05dc\u05d0 \u05d4\u05e6\u05dc\u05d7\u05e0\u05d5 \u05dc\u05e9\u05dc\u05d5\u05d7 \u05d0\u05ea \u05d4\u05e4\u05e0\u05d9\u05d9\u05d4. \u05e0\u05e1\u05d5 \u05e9\u05d5\u05d1.',
  messageLabel:
    '\u05de\u05d4 \u05ea\u05e8\u05e6\u05d5 \u05dc\u05e9\u05dc\u05d5\u05d7 \u05dc\u05e9\u05d9\u05e8\u05d5\u05ea \u05dc\u05e7\u05d5\u05d7\u05d5\u05ea?',
  counterSuffix: '\u05ea\u05d5\u05d5\u05d9\u05dd',
};

const FAQ_ITEMS = [
  {
    question:
      '\u05d0\u05d9\u05da \u05de\u05d5\u05e6\u05d0\u05d9\u05dd \u05d0\u05ea \u05db\u05dc \u05d4\u05db\u05e8\u05d8\u05d9\u05e1\u05d9\u05d5\u05ea \u05e9\u05dc\u05d9?',
    answer:
      '\u05d1\u05dc\u05e9\u05d5\u05e0\u05d9\u05ea \u05d4\u05d0\u05e8\u05e0\u05e7 \u05ea\u05e8\u05d0\u05d5 \u05d0\u05ea \u05db\u05dc \u05d4\u05db\u05e8\u05d8\u05d9\u05e1\u05d9\u05d5\u05ea, \u05d4\u05e0\u05d9\u05e7\u05d5\u05d1\u05d9\u05dd \u05d5\u05d4\u05ea\u05e7\u05d3\u05de\u05d5\u05ea \u05e9\u05dc\u05db\u05dd.',
  },
  {
    question:
      '\u05d0\u05d9\u05e4\u05d4 \u05d0\u05e0\u05d9 \u05e8\u05d5\u05d0\u05d4 \u05d4\u05d8\u05d1\u05d5\u05ea \u05d6\u05de\u05d9\u05e0\u05d5\u05ea?',
    answer:
      '\u05d1\u05dc\u05e9\u05d5\u05e0\u05d9\u05ea \u05d4\u05d8\u05d1\u05d5\u05ea \u05ea\u05e8\u05d0\u05d5 \u05d0\u05ea \u05db\u05dc \u05d4\u05de\u05d9\u05de\u05d5\u05e9\u05d9\u05dd \u05d5\u05d4\u05e7\u05d5\u05e4\u05d5\u05e0\u05d9\u05dd \u05d4\u05e4\u05e2\u05d9\u05dc\u05d9\u05dd \u05e9\u05e0\u05e6\u05d1\u05e8\u05d5 \u05d1\u05d7\u05e9\u05d1\u05d5\u05df.',
  },
  {
    question:
      '\u05d0\u05d9\u05da \u05de\u05e2\u05d3\u05db\u05e0\u05d9\u05dd \u05d8\u05dc\u05e4\u05d5\u05df \u05d0\u05d5 \u05e4\u05e8\u05d8\u05d9 \u05d7\u05e9\u05d1\u05d5\u05df?',
    answer:
      '\u05d1\u05de\u05e1\u05da \u05e4\u05e8\u05d8\u05d9 \u05d4\u05d7\u05e9\u05d1\u05d5\u05df \u05d0\u05e4\u05e9\u05e8 \u05dc\u05e2\u05d3\u05db\u05df \u05d8\u05dc\u05e4\u05d5\u05df \u05d5\u05dc\u05d1\u05d3\u05d5\u05e7 \u05d0\u05ea \u05e4\u05e8\u05d8\u05d9 \u05d4\u05de\u05e9\u05ea\u05de\u05e9.',
  },
  {
    question:
      '\u05de\u05d4 \u05dc\u05e2\u05e9\u05d5\u05ea \u05d0\u05dd \u05db\u05e8\u05d8\u05d9\u05e1 \u05dc\u05d0 \u05de\u05ea\u05e2\u05d3\u05db\u05df?',
    answer:
      '\u05e8\u05e2\u05e0\u05e0\u05d5 \u05d0\u05ea \u05d4\u05de\u05e1\u05da \u05d0\u05d5 \u05d4\u05de\u05ea\u05d9\u05e0\u05d5 \u05e9\u05e0\u05d9\u05d5\u05ea \u05d1\u05d5\u05d3\u05d3\u05d5\u05ea. \u05d0\u05dd \u05d4\u05d1\u05e2\u05d9\u05d4 \u05de\u05de\u05e9\u05d9\u05db\u05d4, \u05e9\u05dc\u05d7\u05d5 \u05de\u05db\u05d0\u05df \u05e4\u05e0\u05d9\u05d9\u05d4 \u05dc\u05e9\u05d9\u05e8\u05d5\u05ea \u05dc\u05e7\u05d5\u05d7\u05d5\u05ea.',
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
      return error.message.trim().length > 0 ? error.message : TEXT.sendFailed;
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
        contentContainerStyle={[
          styles.scrollContent,
          {
            paddingTop: (insets.top || 0) + 8,
            paddingBottom: tabBarHeight + 24,
          },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.headerRow}>
          <Pressable
            onPress={() => router.back()}
            style={({ pressed }) => [
              styles.backButton,
              pressed ? styles.pressed : null,
            ]}
          >
            <Ionicons name="chevron-forward" size={20} color="#111827" />
          </Pressable>

          <View style={styles.headerTextWrap}>
            <Text style={styles.pageTitle}>{TEXT.title}</Text>
          </View>
        </View>

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

            <Pressable
              onPress={handleSubmit}
              disabled={isSendDisabled}
              style={({ pressed }) => [
                styles.sendButton,
                isSendDisabled
                  ? styles.sendButtonDisabled
                  : styles.sendButtonActive,
                pressed && !isSendDisabled ? styles.sendButtonPressed : null,
              ]}
            >
              {isSending ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text
                  style={[
                    styles.sendButtonText,
                    isSendDisabled
                      ? styles.sendButtonTextDisabled
                      : styles.sendButtonTextActive,
                  ]}
                >
                  {TEXT.send}
                </Text>
              )}
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#F3F3F1' },
  scrollContent: {
    paddingHorizontal: 20,
    gap: 16,
  },
  pressed: { opacity: 0.88 },

  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 14,
  },
  headerTextWrap: {
    flex: 1,
    alignItems: 'flex-end',
  },
  backButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pageTitle: {
    fontSize: 24,
    lineHeight: 30,
    fontWeight: '900',
    color: '#171717',
    textAlign: 'right',
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
    shadowColor: '#111827',
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },

  faqCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
    padding: 14,
    gap: 10,
  },
  faqHeader: {
    flexDirection: 'row-reverse',
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
  },
  counterRow: {
    alignItems: 'flex-end',
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
  sendButton: {
    alignSelf: 'center',
    minHeight: 52,
    width: 240,
    borderRadius: 999,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#DCE6FF',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 22,
    paddingVertical: 12,
    marginTop: 4,
  },
  sendButtonActive: {
    backgroundColor: '#2F6BFF',
    borderColor: '#2F6BFF',
    shadowColor: '#2F6BFF',
    shadowOpacity: 0.22,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  sendButtonDisabled: {
    backgroundColor: '#FFFFFF',
    borderColor: '#BFDBFE',
  },
  sendButtonPressed: {
    backgroundColor: '#245AE8',
    borderColor: '#245AE8',
  },
  sendButtonText: {
    fontSize: 14,
    fontWeight: '800',
    textAlign: 'center',
  },
  sendButtonTextActive: {
    color: '#FFFFFF',
  },
  sendButtonTextDisabled: {
    color: '#2F6BFF',
  },
});
