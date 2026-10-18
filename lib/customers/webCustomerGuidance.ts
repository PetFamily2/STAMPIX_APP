import { resolveCustomerContactRecommendation } from './contactAction';

const LABELS: Record<string, string> = {
  NEW: 'חדש במועדון',
  ACTIVE: 'פעיל',
  NEEDS_NURTURE: 'כדאי לחזק קשר',
  NEEDS_WINBACK: 'לא ביקר לאחרונה',
  CLOSE_TO_REWARD: 'קרוב להטבה',
};

export function webCustomerStateLabel(state?: string | null) {
  return state && Object.hasOwn(LABELS, state) ? LABELS[state] : 'ללא סיווג';
}

// Explain the server's classification without inventing thresholds or changing it.
export function webCustomerGuidance(input: {
  customerState?: string | null;
  marketingOptIn: boolean;
  phone?: string | null;
  email?: string | null;
}) {
  const contact = input.marketingOptIn
    ? resolveCustomerContactRecommendation({
        customerState: input.customerState,
        phone: input.phone,
        email: input.email,
      })
    : null;
  switch (input.customerState) {
    case 'NEEDS_WINBACK':
      return {
        explanation:
          'לפי הפעילות שנרשמה במועדון, הלקוח לא ביקר לאחרונה. זהו סימון למעקב, לא תקלה בכרטיס.',
        nextStep:
          'בדקו את הביקור האחרון ואת ההתקדמות בכרטיסיות למטה. אם מתאים ויש הסכמה לדיוור, אפשר להזמין את הלקוח לחזור בפנייה אישית.',
        contact,
      };
    case 'NEEDS_NURTURE':
      return {
        explanation:
          'הפעילות האחרונה במועדון מצביעה שכדאי לחזק את הקשר עם הלקוח.',
        nextStep:
          'בדקו את הכרטיסיות והפעילות למטה. בביקור הבא אפשר להזכיר ללקוח את ההתקדמות שלו להטבה.',
        contact: null,
      };
    case 'CLOSE_TO_REWARD':
      return {
        explanation: 'הלקוח קרוב להשלמת אחת הכרטיסיות הפעילות.',
        nextStep:
          'בדקו כמה חותמות נשארו בכרטיסיות למטה והזכירו ללקוח את ההטבה בביקור הבא.',
        contact: null,
      };
    case 'NEW':
      return {
        explanation: 'הלקוח הצטרף לאחרונה למועדון.',
        nextStep: 'ודאו שהוא מכיר את הכרטיסייה ואת אופן צבירת החותמות.',
        contact: null,
      };
    default:
      return {
        explanation:
          input.customerState === 'ACTIVE'
            ? 'הלקוח מסווג כפעיל לפי הפעילות במועדון.'
            : 'אין כרגע סיווג זמין ללקוח.',
        nextStep: 'אפשר לעיין בכרטיסיות ובהיסטוריית הפעילות למטה.',
        contact: null,
      };
  }
}
