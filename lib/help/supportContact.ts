import { Alert, Linking } from 'react-native';

export const SUPPORT_MESSAGE_MAX_LENGTH = 1200;

export const SUPPORT_WHATSAPP = {
  clickToChatNumber: '972555705440',
  prefillByContext: {
    customer: 'שלום, אני לקוח StampAix וצריך עזרה.',
    business: 'שלום, אני פונה מתמיכת העסק ב-StampAix.',
  },
} as const;

export type SupportWhatsAppContext =
  keyof typeof SUPPORT_WHATSAPP.prefillByContext;

export const SUPPORT_CONTACT_COPY = {
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
  whatsappTitle: 'WhatsApp',
  whatsappSubtitle: 'שיחה עם StampAix',
  whatsappUnavailable:
    'לא הצלחנו לפתוח את WhatsApp. אפשר לשלוח פנייה בטופס למעלה.',
  whatsappAccessibility: 'פתיחת שיחת WhatsApp עם StampAix',
} as const;

export function buildSupportWhatsAppUrl(
  context: SupportWhatsAppContext = 'customer'
) {
  const text = SUPPORT_WHATSAPP.prefillByContext[context];
  return `https://wa.me/${SUPPORT_WHATSAPP.clickToChatNumber}?text=${encodeURIComponent(text)}`;
}

export async function openSupportWhatsApp(
  context: SupportWhatsAppContext = 'customer'
): Promise<'opened' | 'unavailable'> {
  const url = buildSupportWhatsAppUrl(context);

  try {
    const canOpen = await Linking.canOpenURL(url);
    if (canOpen) {
      await Linking.openURL(url);
      return 'opened';
    }
  } catch {
    // Some browsers reject canOpenURL; try a direct open next.
  }

  try {
    await Linking.openURL(url);
    return 'opened';
  } catch {
    return 'unavailable';
  }
}

export function alertWhatsAppUnavailable() {
  Alert.alert(
    SUPPORT_CONTACT_COPY.errorTitle,
    SUPPORT_CONTACT_COPY.whatsappUnavailable
  );
}

export function supportRequestErrorMessage(error: unknown) {
  if (!(error instanceof Error)) {
    return SUPPORT_CONTACT_COPY.sendFailed;
  }

  switch (error.message) {
    case 'MESSAGE_REQUIRED':
      return SUPPORT_CONTACT_COPY.messageRequired;
    case 'MESSAGE_TOO_LONG':
      return SUPPORT_CONTACT_COPY.messageTooLong;
    default:
      return SUPPORT_CONTACT_COPY.sendFailed;
  }
}
