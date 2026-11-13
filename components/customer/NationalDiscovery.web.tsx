import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { useAction, usePaginatedQuery, useQuery } from 'convex/react';
import { type Href, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView } from 'react-native';
import BusinessModeCtaCard from '@/components/customer/BusinessModeCtaCard';
import { api } from '@/convex/_generated/api';
import type {
  DiscoveryLocation,
  DiscoveryPlace,
} from '@/convex/lib/discoveryWeb';
import { BUSINESS_WEB_TOKENS as T } from '@/lib/design/businessWebTokens';
import {
  type DiscoveryPartner,
  type DiscoveryResult,
  discoveryMapsUrl,
  mergeDiscoveryResults,
} from '@/lib/discovery/webResults';
import { customerBusinessRoute } from '@/lib/navigation/customerRoutes';

function PlaceAttribution({ result }: { result: DiscoveryResult }) {
  if (!result.fromGoogle) {
    return null;
  }
  return (
    <div className="attribution">
      <span className="google-attribution" translate="no" dir="ltr">
        Google Maps
      </span>
      {result.attributions.map((attribution) => (
        <a
          key={`${attribution.uri}-${attribution.provider}`}
          href={attribution.uri}
          target="_blank"
          rel="noopener noreferrer"
        >
          {attribution.provider}
        </a>
      ))}
    </div>
  );
}

export function NationalDiscovery() {
  const router = useRouter();
  const tabHeight = useBottomTabBarHeight();
  const [draftTerm, setDraftTerm] = useState('');
  const [term, setTerm] = useState('');
  const [places, setPlaces] = useState<DiscoveryPlace[]>([]);
  const [placePartners, setPlacePartners] = useState<DiscoveryPartner[]>([]);
  const [nextToken, setNextToken] = useState<string | null>(null);
  const [partnerOnly, setPartnerOnly] = useState(false);
  const [selected, setSelected] = useState<DiscoveryResult | null>(null);
  const [mapOpen, setMapOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [location, setLocation] = useState<DiscoveryLocation>();
  const [locating, setLocating] = useState(false);
  const searchVersion = useRef(0);
  const inFlight = useRef(false);
  const details = useRef<HTMLDialogElement>(null);
  const action = useAction(api.discoveryWeb.searchPlaces);
  const partners = usePaginatedQuery(
    api.discoveryWeb.partners,
    {
      term: location && term === 'עסקים' ? '' : term,
      ...(location ? { location } : {}),
    },
    { initialNumItems: 20 }
  );
  const saved = useQuery(api.memberships.byCustomerBusinesses, {});
  const embedKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_EMBED_KEY?.trim();
  const results = useMemo(
    () =>
      mergeDiscoveryResults(
        [...partners.results, ...placePartners],
        places
      ).filter((result) => !partnerOnly || result.partner),
    [partners.results, placePartners, places, partnerOnly]
  );
  useEffect(
    () => () => {
      searchVersion.current += 1;
    },
    []
  );
  useEffect(() => {
    if (selected) {
      details.current?.showModal();
    }
  }, [selected]);

  const search = async (append: boolean, nearby?: DiscoveryLocation) => {
    if (inFlight.current) {
      return;
    }
    const submitted = (
      append ? term : nearby ? draftTerm || 'עסקים' : draftTerm
    ).trim();
    const searchLocation = append ? location : nearby;
    if (submitted && (submitted.length < 2 || submitted.length > 120)) {
      setError('הקלידו שם עסק, תחום או עיר, בין 2 ל־120 תווים.');
      return;
    }
    const version = ++searchVersion.current;
    if (!append) {
      setTerm(submitted);
      setLocation(searchLocation);
      setPlaces([]);
      setPlacePartners([]);
      setNextToken(null);
    }
    setError('');
    if (!submitted) {
      return;
    }
    inFlight.current = true;
    setBusy(true);
    try {
      const result = await action({
        term: submitted,
        ...(append && nextToken ? { pageToken: nextToken } : {}),
        ...(searchLocation ? { location: searchLocation } : {}),
      });
      if (searchVersion.current !== version) {
        return;
      }
      setPlaces((current) =>
        append ? [...current, ...result.places] : result.places
      );
      setPlacePartners((current) =>
        append ? [...current, ...result.partners] : result.partners
      );
      setNextToken(result.nextPageToken);
    } catch {
      if (searchVersion.current === version) {
        setError(
          'לא הצלחנו להשלים את חיפוש Google כרגע. שותפי StampAix עדיין מוצגים. נסו שוב בעוד רגע או דייקו את החיפוש.'
        );
      }
    } finally {
      inFlight.current = false;
      if (searchVersion.current === version) {
        setBusy(false);
      }
    }
  };
  const nearby = async () => {
    if (locating || inFlight.current) {
      return;
    }
    if (!navigator.geolocation) {
      setError('המיקום אינו זמין בדפדפן הזה. אפשר לחפש לפי עיר.');
      return;
    }
    setLocating(true);
    setError('');
    try {
      const position = await new Promise<GeolocationPosition>(
        (resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: false,
            timeout: 10000,
            maximumAge: 60000,
          });
        }
      );
      if (!details.current?.isConnected) {
        return;
      }
      await search(false, {
        lat: Math.round(position.coords.latitude * 1000) / 1000,
        lng: Math.round(position.coords.longitude * 1000) / 1000,
        radius: 3000,
      });
    } catch {
      setError('לא התקבל מיקום. בדקו הרשאה בהגדרות האתר או חפשו לפי עיר.');
    } finally {
      setLocating(false);
    }
  };
  const mapQuery = selected?.placeId
    ? `place_id:${selected.placeId}`
    : `${term || 'עסקים'} ישראל`;
  const mapUrl = embedKey
    ? `https://www.google.com/maps/embed/v1/${selected?.placeId ? 'place' : 'search'}?key=${encodeURIComponent(embedKey)}&q=${encodeURIComponent(mapQuery)}&language=he&region=IL`
    : null;
  const openPartner = (businessId: string) => {
    details.current?.close();
    setSelected(null);
    router.push(customerBusinessRoute(businessId) as Href);
  };

  return (
    <ScrollView
      contentContainerStyle={{ paddingBottom: tabHeight + 24 }}
      keyboardShouldPersistTaps="handled"
    >
      <main className="sx-discovery" dir="rtl">
        <style>{`
        .sx-discovery .google-attribution{display:inline-block;white-space:nowrap;font:400 14px Arial,sans-serif;color:#5e5e5e}.sx-discovery .attribution{display:flex;gap:12px;flex-wrap:wrap;align-items:center}.sx-discovery .location-note{font-size:13px}
        .sx-discovery{font-family:Heebo,Arial,sans-serif;max-width:960px;width:100%;box-sizing:border-box;margin:auto;padding:24px 20px;color:${T.colors.textPrimary};display:grid;gap:20px}.sx-discovery *{box-sizing:border-box}.sx-discovery h1,.sx-discovery h2,.sx-discovery p{margin:0}.sx-discovery h1{font-size:24px}.sx-discovery h2{font-size:18px}.sx-discovery p{line-height:1.65;color:${T.colors.textSecondary}}
        .sx-discovery .panel,.sx-discovery article{background:white;padding:20px;border:1px solid ${T.colors.border};border-radius:16px;display:grid;gap:12px;min-width:0}.sx-discovery form{display:flex;gap:12px;flex-wrap:wrap}.sx-discovery label{display:grid;gap:8px;flex:1;min-width:180px}.sx-discovery input{font:inherit;padding:12px;border-radius:12px;border:1px solid ${T.colors.borderStrong};min-height:48px;width:100%}.sx-discovery button,.sx-discovery a.button{font:600 15px Heebo,Arial,sans-serif;display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:48px;padding:10px 16px;border-radius:12px;border:1px solid ${T.colors.primary};color:${T.colors.primary};background:white;cursor:pointer;text-decoration:none}.sx-discovery .primary,.sx-discovery button[aria-pressed=true]{background:${T.colors.primary};color:white}.sx-discovery button:disabled{opacity:.55;cursor:default}.sx-discovery .tools{display:flex;gap:12px;flex-wrap:wrap}.sx-discovery :focus-visible{outline:3px solid ${T.colors.primary};outline-offset:3px}.sx-discovery .cards{display:grid;gap:12px;grid-template-columns:repeat(auto-fit,minmax(min(100%,280px),1fr))}.sx-discovery .badge{color:${T.colors.success};font-weight:700}.sx-discovery .row{display:flex;justify-content:space-between;gap:16px;align-items:center}.sx-discovery [role=alert]{color:${T.colors.danger}}.sx-discovery iframe{width:100%;height:420px;border:0;border-radius:12px}.sx-discovery dialog{max-width:min(600px,calc(100vw - 32px));max-height:85dvh;overflow:auto;border:1px solid ${T.colors.borderStrong};border-radius:20px;padding:24px;color:inherit;background:white}.sx-discovery dialog::backdrop{background:rgba(15,23,42,.55)}.sx-discovery dialog>div{display:grid;gap:16px}.sx-discovery .attribution{font-size:12px}.sx-discovery .attribution a{color:${T.colors.primary}}
      `}</style>
        <header>
          <h1>גילוי עסקים</h1>
          <p>
            חפשו עסק, תחום או עיר בישראל. אפשר לגלות עסקים גם ללא הרשאת מיקום.
          </p>
        </header>
        <section className="panel" aria-label="חיפוש עסקים">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void search(false);
            }}
          >
            <label>
              שם עסק, תחום או עיר
              <input
                value={draftTerm}
                maxLength={120}
                placeholder="למשל: בית קפה בטבריה"
                onChange={(event) => setDraftTerm(event.target.value)}
              />
            </label>
            <button className="primary" type="submit" disabled={busy}>
              חיפוש
            </button>
          </form>
          <div className="tools">
            <button
              type="button"
              disabled={busy || locating}
              onClick={() => {
                void nearby();
              }}
            >
              {locating ? 'מאתרים מיקום…' : 'חיפוש בקרבתי · 3 ק״מ'}
            </button>
            <button
              type="button"
              aria-pressed={partnerOnly}
              onClick={() => setPartnerOnly((value) => !value)}
            >
              שותפי StampAix בלבד
            </button>
            <button
              type="button"
              aria-expanded={mapOpen}
              onClick={() => setMapOpen((value) => !value)}
            >
              {mapOpen ? 'רשימה' : 'מפה'}
            </button>
          </div>
          <p className="location-note">
            בלחיצה על חיפוש בקרבתי, מיקום מעוגל נשלח ל־Google לצורך החיפוש בלבד.
            הוא אינו נשמר בפרופיל. החיפוש הרגיל עובד בכל ישראל.
          </p>
          {location ? (
            <output>
              מוצגות תוצאות בטווח 3 ק״מ מהמיקום שנבחר. חיפוש רגיל יחזיר לחיפוש
              ארצי. הרשימה עשויה להיות חלקית; אפשר לטעון תוצאות נוספות.
            </output>
          ) : null}
          {error ? <p role="alert">{error}</p> : null}
          {busy ? <output>מחפשים עסקים…</output> : null}
        </section>
        {mapOpen ? (
          <section className="panel" aria-label="מפת עסקים">
            {mapUrl ? (
              <iframe
                title="מפת Google לחיפוש עסקים"
                src={mapUrl}
                loading="lazy"
                referrerPolicy="strict-origin-when-cross-origin"
                allowFullScreen={true}
              />
            ) : (
              <>
                <p>
                  המפה המוטמעת עדיין אינה זמינה בסביבה הזו. הרשימה זמינה גם
                  בלעדיה.
                </p>
                <a
                  className="button"
                  href={discoveryMapsUrl({
                    name: term || 'עסקים בישראל',
                    address: '',
                    placeId: null,
                  })}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  פתיחת החיפוש ב־Google Maps
                </a>
              </>
            )}
          </section>
        ) : null}
        <section aria-label="תוצאות חיפוש" className="panel">
          <h2>{term ? `תוצאות עבור „${term}”` : 'שותפי StampAix בישראל'}</h2>
          <p>
            כרטיסיית StampAix זמינה אצל השותפים המסומנים בלבד. פתחו פרטי עסק
            לפני הצטרפות.
          </p>
          {partners.status === 'LoadingFirstPage' ? (
            <output>טוענים שותפים…</output>
          ) : null}
          <div className="cards">
            {results.map((result) => (
              <article key={result.key}>
                <div className="row">
                  <h2>{result.name}</h2>
                  {result.partner ? (
                    <span className="badge">שותף StampAix</span>
                  ) : null}
                </div>
                <p>{result.address || 'כתובת לא זמינה'}</p>
                {result.partner?.description ? (
                  <p>{result.partner.description}</p>
                ) : null}
                <button type="button" onClick={() => setSelected(result)}>
                  פרטי העסק
                </button>
                <PlaceAttribution result={result} />
              </article>
            ))}
          </div>
          {!busy &&
          partners.status !== 'LoadingFirstPage' &&
          results.length === 0 ? (
            <p>לא נמצאו תוצאות. נסו שם מלא או עיר אחרת.</p>
          ) : null}
          <div className="tools">
            {partners.status === 'CanLoadMore' ? (
              <button type="button" onClick={() => partners.loadMore(20)}>
                שותפים נוספים
              </button>
            ) : null}
            {nextToken ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  void search(true);
                }}
              >
                תוצאות Google נוספות
              </button>
            ) : null}
          </div>
        </section>
        {(saved?.length ?? 0) > 0 ? (
          <section className="panel">
            <h2>המועדונים שלי</h2>
            {saved?.map((business) => (
              <button
                key={String(business.businessId)}
                type="button"
                onClick={() => openPartner(String(business.businessId))}
              >
                {business.businessName} · {business.joinedProgramCount} כרטיסיות
              </button>
            ))}
          </section>
        ) : null}
        <BusinessModeCtaCard forcePromotionalBanner={true} />
        <dialog
          ref={details}
          onClose={() => setSelected(null)}
          aria-labelledby="sx-place-title"
        >
          <div>
            {selected ? (
              <>
                <div className="row">
                  <h2 id="sx-place-title">{selected.name}</h2>
                  <button
                    type="button"
                    onClick={() => {
                      details.current?.close();
                      setSelected(null);
                    }}
                    aria-label="סגירת פרטי העסק"
                  >
                    סגירה
                  </button>
                </div>
                <p>{selected.address || 'כתובת לא זמינה'}</p>
                <PlaceAttribution result={selected} />
                <p>
                  {selected.partner?.description ||
                    (selected.partner
                      ? 'עסק שותף ב־StampAix.'
                      : 'לעסק זה לא נמצאה כרטיסיית StampAix פעילה ברשומות השותפים. אפשר לצפות בו במפות. הצטרפות אינה זמינה מכאן.')}{' '}
                </p>
                <a
                  className="button"
                  href={discoveryMapsUrl(selected)}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  מיקום וניווט ב־Google Maps
                </a>
                {selected.partner ? (
                  <button
                    className="primary"
                    type="button"
                    onClick={() => {
                      if (selected.partner) {
                        openPartner(selected.partner.businessId);
                      }
                    }}
                  >
                    לכרטיסיות ולפרטי השותף
                  </button>
                ) : null}
              </>
            ) : null}
          </div>
        </dialog>
      </main>
    </ScrollView>
  );
}
