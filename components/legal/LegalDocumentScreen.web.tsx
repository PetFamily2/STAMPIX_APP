import { useLocalSearchParams, useRouter } from 'expo-router';
import { ScrollView } from 'react-native';
import { BUSINESS_WEB_TOKENS as T } from '@/lib/design/businessWebTokens';
import {
  CANONICAL_ACCOUNT_DELETION_URL,
  CANONICAL_PRIVACY_URL,
  CANONICAL_TERMS_URL,
} from '@/lib/legalContract';
import {
  LEGAL_DOCUMENT_ORDER,
  type LegalDocumentKey,
} from '@/lib/legalDocuments';
import { WEB_LEGAL_VERSION } from '@/lib/legalWebContract';
import { WEB_LEGAL_DOCUMENTS } from '@/lib/legalWebDocuments';
import { safeBack } from '@/lib/navigation';

export function LegalDocumentScreen({
  fallbackHref,
}: {
  fallbackHref: string;
}) {
  const router = useRouter();
  const params = useLocalSearchParams<{
    document?: string;
    returnTo?: string;
  }>();
  const key: LegalDocumentKey =
    params.document === 'terms' || params.document === 'deletion'
      ? params.document
      : 'privacy';
  const document = WEB_LEGAL_DOCUMENTS[key];
  const fallback =
    params.returnTo === 'business-account'
      ? '/(authenticated)/(business)/settings-business-account'
      : fallbackHref;
  return (
    <ScrollView contentContainerStyle={{ paddingBottom: 96 }}>
      <main dir="rtl" className="sx-web-legal">
        <style>{`.sx-web-legal{font:16px/1.75 Heebo,Arial,sans-serif;color:${T.colors.textPrimary};max-width:900px;margin:auto;padding:24px 20px}.sx-web-legal h1{font-size:26px}.sx-web-legal h2{font-size:20px}.sx-web-legal p{overflow-wrap:anywhere}.sx-web-legal section{background:white;border:1px solid ${T.colors.border};border-radius:16px;padding:20px;margin-top:16px}.sx-web-legal nav{display:flex;gap:12px;flex-wrap:wrap}.sx-web-legal button,.sx-web-legal a{font:inherit;display:inline-flex;align-items:center;min-height:48px;border-radius:12px;padding:8px 16px;border:1px solid ${T.colors.primary};color:${T.colors.primary};background:white;text-decoration:none;cursor:pointer}.sx-web-legal button[aria-current=page]{background:${T.colors.primary};color:white}.sx-web-legal :focus-visible{outline:3px solid ${T.colors.primary};outline-offset:3px}`}</style>
        <button type="button" onClick={() => safeBack(fallback)}>
          חזרה
        </button>
        <h1>{document.title}</h1>
        <p>{document.subtitle}</p>
        <p>
          עודכן: {document.updatedAt} · גרסה {WEB_LEGAL_VERSION}
        </p>
        <nav aria-label="מסמכים משפטיים">
          {LEGAL_DOCUMENT_ORDER.map((item) => (
            <button
              key={item}
              type="button"
              aria-current={item === key ? 'page' : undefined}
              onClick={() => router.setParams({ document: item })}
            >
              {WEB_LEGAL_DOCUMENTS[item].tabLabel}
            </button>
          ))}
        </nav>
        {document.sections.map((section) => (
          <section key={section.title}>
            <h2>{section.title}</h2>
            {section.body.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
          </section>
        ))}
        <nav aria-label="מסמכים באתר" style={{ marginTop: 20 }}>
          <a
            href={CANONICAL_PRIVACY_URL}
            target="_blank"
            rel="noopener noreferrer"
          >
            פרטיות באתר
          </a>
          <a
            href={CANONICAL_TERMS_URL}
            target="_blank"
            rel="noopener noreferrer"
          >
            תנאים באתר
          </a>
          <a
            href={CANONICAL_ACCOUNT_DELETION_URL}
            target="_blank"
            rel="noopener noreferrer"
          >
            בקשת מחיקה
          </a>
        </nav>
      </main>
    </ScrollView>
  );
}
