import { useMutation, useQuery } from 'convex/react';
import { type Href, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { useBusinessWebUnsavedChanges } from '@/components/business-web/BusinessWebRouteContext';
import { api } from '@/convex/_generated/api';
import { useActiveBusiness } from '@/hooks/useActiveBusiness';
import { buildWebWinbackDraft } from '@/lib/campaigns/webWinbackDraft';
import { BUSINESS_WEB_TOKENS as TOKENS } from '@/lib/design/businessWebTokens';

export function WebWinbackCampaignSetup({
  requestedBusinessId,
}: {
  requestedBusinessId?: string;
}) {
  const { activeBusinessId, activeBusiness } = useActiveBusiness();
  const router = useRouter();
  const createDraft = useMutation(api.campaigns.createCampaignDraft);
  const scopeMatches =
    !!activeBusinessId &&
    (!requestedBusinessId || requestedBusinessId === String(activeBusinessId));
  const campaigns = useQuery(
    api.campaigns.listManagementCampaignsByBusiness,
    scopeMatches && activeBusinessId ? { businessId: activeBusinessId } : 'skip'
  );
  const [days, setDays] = useState('30');
  const [mode, setMode] = useState<'invite' | 'offer'>('invite');
  const [offer, setOffer] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const alive = useRef(true);
  useBusinessWebUnsavedChanges(
    days !== '30' || mode !== 'invite' || offer.length > 0
  );
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const canCreate = activeBusiness?.capabilities?.create_campaigns === true;
  const existing = (campaigns ?? []).filter(
    (campaign: { type: string; lifecycle: string }) =>
      campaign.type === 'winback' && campaign.lifecycle !== 'archived'
  );

  if (!scopeMatches) {
    return (
      <p role="alert" dir="rtl">
        בחרו את העסק שממנו נפתחה הגדרת הקמפיין. לא נוצרה טיוטה.
      </p>
    );
  }

  return (
    <section dir="rtl" className="sx-winback">
      <style>{`
        .sx-winback{width:100%;max-width:760px;margin:auto;display:flex;flex-direction:column;gap:16px;color:${TOKENS.colors.textPrimary};font-family:Heebo,Arial,sans-serif}
        .sx-winback h1,.sx-winback h2,.sx-winback p{margin:0}
        .sx-winback h1{font-size:22px}.sx-winback h2{font-size:18px}
        .sx-winback p{line-height:1.6;color:${TOKENS.colors.textSecondary}}
        .sx-winback form,.sx-winback aside{display:flex;flex-direction:column;gap:16px;background:${TOKENS.colors.elevatedSurface};padding:20px;border-radius:${TOKENS.radii.lg}px;border:1px solid ${TOKENS.colors.border}}
        .sx-winback label{display:flex;flex-direction:column;gap:8px}.sx-winback input,.sx-winback textarea{font:inherit;padding:12px;min-height:48px;box-sizing:border-box;border:1px solid ${TOKENS.colors.borderStrong};border-radius:${TOKENS.radii.md}px;max-width:100%;background:${TOKENS.colors.elevatedSurface};color:${TOKENS.colors.textPrimary}}
        .sx-winback button{font:600 16px Heebo,Arial,sans-serif;min-height:48px;padding:10px 16px;border-radius:${TOKENS.radii.md}px;border:1px solid ${TOKENS.colors.primary};background:${TOKENS.colors.elevatedSurface};color:${TOKENS.colors.primary};cursor:pointer}
        .sx-winback button[type=submit]{background:${TOKENS.colors.primary};color:${TOKENS.colors.elevatedSurface}}
        .sx-winback button:disabled{opacity:.5;cursor:default}.sx-winback .choices{display:flex;flex-wrap:wrap;gap:8px}.sx-winback button[aria-pressed=true]{background:${TOKENS.colors.primarySubtle};border-width:2px}
        .sx-winback [role=alert]{color:${TOKENS.colors.danger}}
      `}</style>
      <h1>קמפיין החזרת לקוחות</h1>
      <p>
        המערכת תאתר לקוחות לפי מספר הימים שתגדירו ללא פעילות בכרטיסייה. רק
        לקוחות עם הסכמה לדיוור ייכללו בקהל.
      </p>
      <p>
        הקמפיין מיועד לקבוצת לקוחות מתאימה בעסק, לא רק ללקוח שממנו הגעתם. לפני
        הפעלה בדקו את אומדן הקהל בעורך.
      </p>
      {existing.length > 0 ? (
        <aside>
          <h2>כבר יש קמפייני החזרה בעסק</h2>
          <p>אפשר לערוך קמפיין קיים במקום ליצור טיוטה נוספת.</p>
          {existing.map(
            (campaign: {
              campaignId: string;
              messageTitle?: string;
              lifecycle: string;
            }) => (
              <button
                key={campaign.campaignId}
                type="button"
                disabled={busy}
                onClick={() =>
                  router.push({
                    pathname: '/business/campaign/[campaignId]',
                    params: {
                      campaignId: campaign.campaignId,
                      businessId: String(activeBusinessId),
                    },
                  } as Href)
                }
              >
                {campaign.messageTitle || 'קמפיין החזרה'} ·{' '}
                {campaign.lifecycle === 'active' ? 'פעיל' : 'לא פעיל'} · לפתיחה
              </button>
            )
          )}
        </aside>
      ) : null}
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (
            !activeBusinessId ||
            !scopeMatches ||
            !canCreate ||
            inFlight.current ||
            campaigns === undefined
          ) {
            return;
          }
          if (navigator.onLine === false) {
            setError('דרוש חיבור לרשת כדי ליצור טיוטה. לא נשלחה בקשה.');
            return;
          }
          let draft: ReturnType<typeof buildWebWinbackDraft>;
          try {
            draft = buildWebWinbackDraft({ days, mode, offer });
          } catch (failure) {
            setError(
              failure instanceof Error
                ? failure.message
                : 'בדקו את פרטי הקמפיין.'
            );
            return;
          }
          inFlight.current = true;
          setBusy(true);
          setError('');
          void createDraft({ businessId: activeBusinessId, ...draft })
            .then((result) => {
              if (alive.current) {
                router.replace({
                  pathname: '/business/campaign/[campaignId]',
                  params: {
                    campaignId: String(result.campaignId),
                    businessId: String(activeBusinessId),
                  },
                } as Href);
              }
            })
            .catch(() => {
              if (alive.current) {
                setError(
                  'לא הצלחנו ליצור את הטיוטה. בדקו חיבור והרשאה ונסו שוב.'
                );
              }
            })
            .finally(() => {
              inFlight.current = false;
              if (alive.current) {
                setBusy(false);
              }
            });
        }}
      >
        <h2>הכנת קמפיין החזרה חדש</h2>
        {!canCreate ? (
          <p role="alert">רק בעלים או מנהל עם הרשאה יכולים ליצור קמפיין.</p>
        ) : null}
        <label>
          אחרי כמה ימים ללא פעילות?
          <input
            type="number"
            min={1}
            max={365}
            step={1}
            required={true}
            value={days}
            disabled={busy || !canCreate}
            onChange={(event) => setDays(event.target.value)}
          />
        </label>
        <fieldset
          className="choices"
          style={{ border: 0, padding: 0, margin: 0 }}
        >
          <legend>סוג הפנייה</legend>
          <button
            type="button"
            aria-pressed={mode === 'invite'}
            disabled={busy || !canCreate}
            onClick={() => setMode('invite')}
          >
            הזמנה לחזור
          </button>
          <button
            type="button"
            aria-pressed={mode === 'offer'}
            disabled={busy || !canCreate}
            onClick={() => setMode('offer')}
          >
            הצעה אטרקטיבית
          </button>
        </fieldset>
        {mode === 'offer' ? (
          <label>
            מה ההצעה ללקוח?
            <textarea
              required={true}
              minLength={3}
              maxLength={400}
              rows={3}
              value={offer}
              disabled={busy || !canCreate}
              onChange={(event) => setOffer(event.target.value)}
            />
          </label>
        ) : null}
        <p>
          ההצעה היא תוכן ההודעה; היא אינה מוסיפה חותמות או יוצרת זכאות להטבה
          במערכת.
        </p>
        <p>
          כאן תיווצר טיוטה בלבד. בעורך הבא בודקים את ההודעה והקהל ומפעילים בנפרד
          את האוטומציה. לאחר הפעלה המערכת תבדוק חוסר פעילות לפי ההגדרה.
        </p>
        {error ? <p role="alert">{error}</p> : null}
        {campaigns === undefined ? (
          <output>בודקים קמפיינים קיימים בעסק…</output>
        ) : null}
        <button
          type="submit"
          disabled={busy || !canCreate || campaigns === undefined}
        >
          {busy ? 'יוצרים טיוטה…' : 'יצירת טיוטת קמפיין החזרה'}
        </button>
      </form>
    </section>
  );
}
