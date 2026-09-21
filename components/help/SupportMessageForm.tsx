import { useMutation } from 'convex/react';
import { useState } from 'react';
import {
  Alert,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import {
  SETTINGS_TOKENS,
  SettingsPrimaryButton,
} from '@/components/business-settings';
import { api } from '@/convex/_generated/api';
import {
  SUPPORT_CONTACT_COPY,
  SUPPORT_MESSAGE_MAX_LENGTH,
  supportRequestErrorMessage,
} from '@/lib/help/supportContact';
import { alignItems } from '@/lib/rtl';

export function SupportMessageForm({
  variant = 'settings',
}: {
  variant?: 'customer' | 'settings';
}) {
  const sendSupportRequest = useMutation(api.support.sendSupportRequest);
  const [message, setMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const trimmedMessage = message.trim();
  const messageLength = message.length;
  const hasMessage = trimmedMessage.length > 0;
  const isMessageTooLong = messageLength > SUPPORT_MESSAGE_MAX_LENGTH;
  const isButtonActive = hasMessage && !isMessageTooLong;
  const isSendDisabled = isSending || !isButtonActive;
  const isSettings = variant === 'settings';

  const handleSubmit = async () => {
    try {
      setIsSending(true);
      await sendSupportRequest({ message: trimmedMessage });
      setMessage('');
      Alert.alert(
        SUPPORT_CONTACT_COPY.sentTitle,
        SUPPORT_CONTACT_COPY.sentMessage
      );
    } catch (error) {
      Alert.alert(
        SUPPORT_CONTACT_COPY.errorTitle,
        supportRequestErrorMessage(error)
      );
    } finally {
      setIsSending(false);
    }
  };

  return (
    <View style={isSettings ? styles.settingsWrap : styles.customerCard}>
      <Text
        style={isSettings ? styles.settingsLabel : styles.customerLabel}
        maxFontSizeMultiplier={1.4}
      >
        {SUPPORT_CONTACT_COPY.messageLabel}
      </Text>
      <TextInput
        accessibilityLabel={SUPPORT_CONTACT_COPY.messageLabel}
        accessibilityHint={SUPPORT_CONTACT_COPY.messagePlaceholder}
        value={message}
        onChangeText={setMessage}
        editable={!isSending}
        placeholder={SUPPORT_CONTACT_COPY.messagePlaceholder}
        placeholderTextColor="#9CA3AF"
        multiline={true}
        textAlignVertical="top"
        style={isSettings ? styles.settingsInput : styles.customerInput}
      />

      <View style={styles.counterRow}>
        <Text
          style={[
            isSettings ? styles.settingsCounter : styles.customerCounter,
            isMessageTooLong ? styles.counterDanger : null,
          ]}
        >
          {messageLength}/{SUPPORT_MESSAGE_MAX_LENGTH}{' '}
          {SUPPORT_CONTACT_COPY.counterSuffix}
        </Text>
      </View>

      {isSettings ? (
        <SettingsPrimaryButton
          label={
            isSending ? SUPPORT_CONTACT_COPY.sending : SUPPORT_CONTACT_COPY.send
          }
          onPress={() => {
            void handleSubmit();
          }}
          disabled={isSendDisabled}
          loading={isSending}
          accessibilityLabel={SUPPORT_CONTACT_COPY.send}
        />
      ) : (
        <Pressable
          onPress={() => {
            void handleSubmit();
          }}
          disabled={isSendDisabled}
          accessibilityRole="button"
          accessibilityLabel={SUPPORT_CONTACT_COPY.send}
          style={({ pressed }) => [
            styles.customerButton,
            isSendDisabled ? styles.customerButtonDisabled : null,
            pressed && !isSendDisabled ? styles.pressed : null,
          ]}
        >
          <Text
            style={[
              styles.customerButtonText,
              isSendDisabled ? styles.customerButtonTextDisabled : null,
            ]}
          >
            {isSending
              ? SUPPORT_CONTACT_COPY.sending
              : SUPPORT_CONTACT_COPY.send}
          </Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  customerCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
    padding: 14,
    gap: 12,
  },
  settingsWrap: {
    width: '100%',
    gap: 12,
  },
  customerLabel: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '800',
    color: '#18181B',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  settingsLabel: {
    width: '100%',
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700',
    color: SETTINGS_TOKENS.textSecondary,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  customerInput: {
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
  settingsInput: {
    width: '100%',
    minHeight: 132,
    borderRadius: SETTINGS_TOKENS.radius,
    borderWidth: 1,
    borderColor: SETTINGS_TOKENS.border,
    backgroundColor: SETTINGS_TOKENS.surfaceMuted,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 15,
    lineHeight: 21,
    fontWeight: '500',
    color: SETTINGS_TOKENS.textPrimary,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  counterRow: {
    alignItems: alignItems.start,
  },
  customerCounter: {
    fontSize: 11,
    fontWeight: '700',
    color: '#6B7280',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  settingsCounter: {
    fontSize: 12,
    fontWeight: '600',
    color: SETTINGS_TOKENS.textSecondary,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  counterDanger: {
    color: '#B42318',
  },
  customerButton: {
    marginTop: 4,
    width: '100%',
    minHeight: 52,
    borderRadius: 999,
    backgroundColor: '#2F6BFF',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  customerButtonDisabled: {
    backgroundColor: '#D6DCE8',
  },
  customerButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
    textAlign: 'center',
    writingDirection: 'rtl',
  },
  customerButtonTextDisabled: {
    color: '#FFFFFF',
  },
  pressed: { opacity: 0.88 },
});
