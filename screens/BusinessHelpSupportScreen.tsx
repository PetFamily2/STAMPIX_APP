import { useState } from 'react';

import {
  BusinessSettingsSubpageHeader,
  SettingsCard,
  SettingsPageShell,
  SettingsSection,
} from '@/components/business-settings';
import { FaqAccordion, type FaqItemData } from '@/components/help/FaqAccordion';
import { SupportMessageForm } from '@/components/help/SupportMessageForm';
import { SupportWhatsAppButton } from '@/components/help/SupportWhatsAppButton';
import { SUPPORT_CONTACT_COPY } from '@/lib/help/supportContact';
import { BUSINESS_ROUTES } from '@/lib/navigation/businessRoutes';

const TEXT = {
  title: 'עזרה ותמיכה',
  subtitle: 'שאלות ופנייה',
  sectionFaq: 'שאלות ותשובות',
};

const BUSINESS_FAQ_ITEMS: FaqItemData[] = [
  {
    question: 'איך מוצאים את כל הכרטיסיות של העסק?',
    answer: 'בלשונית כרטיסיות תראו את כל כרטיסיות הנאמנות של העסק הפעיל.',
  },
  {
    question: 'איפה מנהלים הטבות ללקוחות?',
    answer: 'בלשונית קמפיינים תראו את ההודעות וההטבות הפעילות של העסק.',
  },
  {
    question: 'איך מעדכנים פרטי עסק או חשבון?',
    answer:
      'במסך הגדרות העסק אפשר לעדכן פרטי עסק, ובפרטי חשבון אפשר לבדוק טלפון ופרטי משתמש.',
  },
  {
    question: 'מה לעשות אם נתון לא מתעדכן?',
    answer:
      'רעננו את המסך או המתינו שניות בודדות. אם הבעיה ממשיכה, שלחו מכאן פנייה לשירות לקוחות.',
  },
];

export default function BusinessHelpSupportScreen() {
  const [expandedIndex, setExpandedIndex] = useState<number | null>(0);

  return (
    <SettingsPageShell
      keyboardAware={true}
      header={
        <BusinessSettingsSubpageHeader
          title={TEXT.title}
          subtitle={TEXT.subtitle}
          fallbackHref={BUSINESS_ROUTES.settings}
        />
      }
    >
      <SettingsSection title={TEXT.sectionFaq}>
        <SettingsCard padded={false}>
          <FaqAccordion
            items={BUSINESS_FAQ_ITEMS}
            expandedIndex={expandedIndex}
            onToggle={(index) =>
              setExpandedIndex((current) => (current === index ? null : index))
            }
          />
        </SettingsCard>
      </SettingsSection>

      <SettingsSection title={SUPPORT_CONTACT_COPY.sectionContact}>
        <SettingsCard>
          <SupportMessageForm />
        </SettingsCard>
        <SupportWhatsAppButton />
      </SettingsSection>
    </SettingsPageShell>
  );
}
