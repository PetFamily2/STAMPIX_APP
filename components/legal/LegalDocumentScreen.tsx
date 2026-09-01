import { useLocalSearchParams, useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { StandaloneBackTitleHeader } from '@/components/StandaloneBackTitleHeader';
import StickyScrollHeader from '@/components/StickyScrollHeader';
import { PRIVACY_POLICY_URL, TERMS_OF_SERVICE_URL } from '@/config/legalUrls';
import {
  LEGAL_DOCUMENT_ORDER,
  LEGAL_DOCUMENTS,
  type LegalDocumentKey,
} from '@/lib/legalDocuments';
import { safeBack } from '@/lib/navigation';
import { flexDirection } from '@/lib/rtl';

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
            {LEGAL_DOCUMENT_ORDER.map((key) => {
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
