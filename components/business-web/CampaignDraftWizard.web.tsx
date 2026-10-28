import { useMutation, useQuery } from 'convex/react';
import { type Href, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { useBusinessWebUnsavedChanges } from '@/components/business-web/BusinessWebRouteContext';
import { api } from '@/convex/_generated/api';
import { useActiveBusiness } from '@/hooks/useActiveBusiness';
import {
  buildWizardCampaignDraft,
  CAMPAIGN_WIZARD_GOALS,
  type CampaignWizardInput,
  type WizardCampaignType,
  wizardInitialCopy,
  wizardStepError,
} from '@/lib/campaigns/campaignWizard';
import { BUSINESS_WEB_TOKENS as TOKENS } from '@/lib/design/businessWebTokens';

const STEPS = [
  'מטרה וכרטיסייה',
  'בחירת קהל',
  'תוכן ההודעה',
  'תצוגת לקוח',
  'בדיקה ושמירה',
];

export function CampaignDraftWizard({
  requestedBusinessId,
}: {
  requestedBusinessId?: string;
}) {
  const { activeBusiness, activeBusinessId } = useActiveBusiness();
  const router = useRouter();
  const createDraft = useMutation(api.campaigns.createCampaignDraft);
  const scopeMatches =
    !!activeBusinessId &&
    (!requestedBusinessId || requestedBusinessId === String(activeBusinessId));
  const programs = useQuery(
    api.loyaltyPrograms.listManagementByBusiness,
    scopeMatches && activeBusinessId ? { businessId: activeBusinessId } : 'skip'
  );
  const [step, setStep] = useState(1);
  const [input, setInput] = useState<CampaignWizardInput>({
    type: 'promo',
    days: '30',
    ...wizardInitialCopy('promo'),
  });
  const [programId, setProgramId] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [saved, setSaved] = useState(false);
  const inFlight = useRef(false);
  const alive = useRef(true);
  const heading = useRef<HTMLHeadingElement>(null);
  const canCreate = activeBusiness?.capabilities?.create_campaigns === true;
  const activePrograms = (programs ?? []).filter(
    (program) => program.lifecycle === 'active'
  );
  const selectedProgram = activePrograms.find(
    (program) => String(program.loyaltyProgramId) === programId
  );
  useBusinessWebUnsavedChanges(
    !saved &&
      (step > 1 ||
        input.messageBody !== wizardInitialCopy(input.type).messageBody)
  );
  useEffect(() => {
    if (heading.current?.dataset.step === String(step)) {
      heading.current.focus();
    }
  }, [step]);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  if (!scopeMatches) {
    return <p role="alert">בחרו את העסק שממנו נפתחה יצירת הקמפיין.</p>;
  }
  if (!canCreate) {
    return <p role="alert">אין לחשבון זה הרשאה ליצור קמפיינים.</p>;
  }

  const field = (
    name: 'title' | 'messageTitle' | 'messageBody',
    value: string
  ) => setInput((current) => ({ ...current, [name]: value }));
  const chooseGoal = (type: WizardCampaignType) =>
    setInput((current) => ({ ...current, type, ...wizardInitialCopy(type) }));
  const save = async () => {
    if (inFlight.current || uncertain || !activeBusinessId || !scopeMatches) {
      return;
    }
    const validation = wizardStepError(5, input);
    if (validation) {
      setError(validation);
      return;
    }
    if (programId && !selectedProgram) {
      setError('הכרטיסייה שנבחרה אינה פעילה. בחרו שוב.');
      return;
    }
    if (navigator.onLine === false) {
      setError('דרוש חיבור לרשת לשמירת טיוטה.');
      return;
    }
    inFlight.current = true;
    setBusy(true);
    setError('');
    try {
      const result = await createDraft({
        businessId: activeBusinessId,
        ...buildWizardCampaignDraft(input),
        ...(selectedProgram
          ? { programId: selectedProgram.loyaltyProgramId }
          : {}),
      });
      if (!alive.current) {
        return;
      }
      setSaved(true);
      router.replace({
        pathname: '/business/campaign/[campaignId]',
        params: {
          campaignId: String(result.campaignId),
          businessId: String(activeBusinessId),
        },
      } as Href);
    } catch {
      if (alive.current) {
        setUncertain(true);
        setError(
          'לא התקבל אישור שמירה. לפני יצירה נוספת, פתחו את רשימת הקמפיינים ובדקו אם הטיוטה נשמרה. לא תישלח בקשה חוזרת אוטומטית.'
        );
      }
    } finally {
      inFlight.current = false;
      if (alive.current) {
        setBusy(false);
      }
    }
  };
  return (
    <section
      className="sx-campaign-wizard"
      dir="rtl"
      aria-label="אשף יצירת קמפיין"
    >
      <style>{`
      .sx-campaign-wizard{max-width:760px;margin:auto;color:${TOKENS.colors.textPrimary};font-family:Heebo,Arial,sans-serif;display:grid;gap:20px}
      .sx-campaign-wizard h1,.sx-campaign-wizard h2,.sx-campaign-wizard p{margin:0}.sx-campaign-wizard h1{font-size:24px}.sx-campaign-wizard h2{font-size:20px}.sx-campaign-wizard p{line-height:1.7;color:${TOKENS.colors.textSecondary}}
      .sx-campaign-wizard ol{display:flex;gap:8px;list-style:none;padding:0;flex-wrap:wrap}.sx-campaign-wizard li{padding:8px 12px;border-radius:12px;background:${TOKENS.colors.elevatedSurface};border:1px solid ${TOKENS.colors.border}}.sx-campaign-wizard [aria-current=step]{border:2px solid ${TOKENS.colors.primary};font-weight:700}
      .sx-campaign-wizard .panel{background:${TOKENS.colors.elevatedSurface};border:1px solid ${TOKENS.colors.border};border-radius:16px;padding:24px;display:grid;gap:16px;min-width:0}.sx-campaign-wizard .choices{display:grid;gap:12px;grid-template-columns:repeat(auto-fit,minmax(180px,1fr))}
      .sx-campaign-wizard label{display:grid;gap:8px}.sx-campaign-wizard .choice{display:flex;align-items:center;padding:12px;border:1px solid ${TOKENS.colors.borderStrong};border-radius:12px;min-height:48px;cursor:pointer}.sx-campaign-wizard input[type=radio]{width:20px;height:20px;accent-color:${TOKENS.colors.primary}}
      .sx-campaign-wizard input:not([type=radio]),.sx-campaign-wizard textarea,.sx-campaign-wizard select{font:inherit;width:100%;box-sizing:border-box;border:1px solid ${TOKENS.colors.borderStrong};border-radius:12px;min-height:48px;padding:12px;background:white;color:inherit}.sx-campaign-wizard textarea{resize:vertical}
      .sx-campaign-wizard button,.sx-campaign-wizard a{font:600 16px Heebo,Arial,sans-serif;min-height:48px;box-sizing:border-box;padding:12px 20px;border-radius:12px;border:1px solid ${TOKENS.colors.primary};background:white;color:${TOKENS.colors.primary};cursor:pointer}.sx-campaign-wizard .primary{background:${TOKENS.colors.primary};color:white}.sx-campaign-wizard button:disabled{opacity:.5;cursor:default}.sx-campaign-wizard footer{display:flex;gap:12px;justify-content:space-between;flex-wrap:wrap}.sx-campaign-wizard [role=alert]{color:${TOKENS.colors.danger};border-right:3px solid currentColor;padding:12px}.sx-campaign-wizard :focus-visible{outline:3px solid ${TOKENS.colors.primary};outline-offset:3px}.sx-campaign-wizard dl{display:grid;gap:8px}.sx-campaign-wizard dt{font-weight:700}.sx-campaign-wizard dd{margin:0 0 12px;overflow-wrap:anywhere}
    `}</style>
      <h1>יצירת קמפיין</h1>
      <p>
        חמישה צעדים להכנת טיוטה. הפעלה, תזמון או שליחה דורשים אישור נפרד בעורך.
      </p>
      <ol aria-label="שלבי הקמפיין">
        {STEPS.map((label, index) => (
          <li
            key={label}
            aria-current={step === index + 1 ? 'step' : undefined}
          >
            {index + 1}. {label}
          </li>
        ))}
      </ol>
      <div className="panel" aria-busy={busy}>
        <h2 ref={heading} tabIndex={-1} data-step={step}>
          שלב {step}: {STEPS[step - 1]}
        </h2>
        {step === 1 ? (
          <>
            <div
              className="choices"
              role="radiogroup"
              aria-label="מטרת הקמפיין"
            >
              {CAMPAIGN_WIZARD_GOALS.map((goal) => (
                <label className="choice" key={goal.type}>
                  <input
                    type="radio"
                    name="campaign-goal"
                    checked={input.type === goal.type}
                    onChange={() => chooseGoal(goal.type)}
                  />
                  {goal.label}
                </label>
              ))}
            </div>
            <label>
              כרטיסייה
              <select
                value={programId}
                disabled={programs === undefined}
                onChange={(event) => setProgramId(event.target.value)}
              >
                <option value="">כל הכרטיסיות הפעילות</option>
                {activePrograms.map((program) => (
                  <option
                    key={String(program.loyaltyProgramId)}
                    value={String(program.loyaltyProgramId)}
                  >
                    {program.title}
                  </option>
                ))}
              </select>
            </label>
          </>
        ) : null}
        {step === 2 ? (
          <>
            <p>
              {
                CAMPAIGN_WIZARD_GOALS.find((goal) => goal.type === input.type)
                  ?.audience
              }
              . רק לקוחות עם הסכמה לדיוור ייכללו בקהל.
            </p>
            {input.type === 'welcome' || input.type === 'winback' ? (
              <label>
                {input.type === 'winback'
                  ? 'אחרי כמה ימים ללא פעילות?'
                  : 'כמה ימים מאז ההצטרפות?'}
                <input
                  type="number"
                  min={1}
                  max={365}
                  step={1}
                  value={input.days}
                  onChange={(event) =>
                    setInput((current) => ({
                      ...current,
                      days: event.target.value,
                    }))
                  }
                />
              </label>
            ) : null}
            <p>
              אומדן הקהל המעודכן יוצג לאחר השמירה, לפני שתאשרו הפעלה. הלקוח
              שממנו הגעתם אינו הקהל היחיד.
            </p>
          </>
        ) : null}
        {step === 3 ? (
          <>
            <label>
              שם הקמפיין לצוות
              <input
                maxLength={60}
                value={input.title}
                onChange={(event) => field('title', event.target.value)}
              />
            </label>
            <label>
              כותרת ללקוח
              <input
                maxLength={60}
                value={input.messageTitle}
                onChange={(event) => field('messageTitle', event.target.value)}
              />
            </label>
            <label>
              תוכן ההודעה
              <textarea
                rows={5}
                maxLength={400}
                value={input.messageBody}
                onChange={(event) => field('messageBody', event.target.value)}
              />
            </label>
            <p>
              כללו תנאים ותוקף לכל הצעה. תוכן ההודעה כשלעצמו אינו יוצר זכאות
              ממוחשבת להטבה.
            </p>
          </>
        ) : null}
        {step === 4 ? (
          <article className="panel" aria-label="תצוגת ההודעה ללקוח">
            <p>{activeBusiness?.name}</p>
            <h2>{input.messageTitle}</h2>
            <p style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
              {input.messageBody}
            </p>
          </article>
        ) : null}
        {step === 5 ? (
          <>
            <dl>
              <dt>מטרה</dt>
              <dd>
                {
                  CAMPAIGN_WIZARD_GOALS.find((goal) => goal.type === input.type)
                    ?.label
                }
              </dd>
              <dt>כרטיסייה</dt>
              <dd>{selectedProgram?.title ?? 'כל הכרטיסיות הפעילות'}</dd>
              <dt>שם הקמפיין</dt>
              <dd>{input.title}</dd>
              <dt>הודעה ללקוח</dt>
              <dd>
                {input.messageTitle}: {input.messageBody}
              </dd>
            </dl>
            <p>
              יישמר קמפיין לא פעיל. בעורך תוכלו לבדוק מכסות וקהל, לבחור תזמון או
              אוטומציה ולהפעיל באישור מפורש.
            </p>
          </>
        ) : null}
        {error ? <p role="alert">{error}</p> : null}
        {uncertain ? (
          <button
            type="button"
            onClick={() => router.push('/business/campaigns' as Href)}
          >
            בדיקת רשימת הקמפיינים
          </button>
        ) : null}
        <footer>
          <button
            type="button"
            disabled={step === 1 || busy}
            onClick={() => {
              setError('');
              setStep((current) => current - 1);
            }}
          >
            חזרה
          </button>
          {step < 5 ? (
            <button
              className="primary"
              type="button"
              disabled={programs === undefined}
              onClick={() => {
                const failure = wizardStepError(step, input);
                setError(failure ?? '');
                if (!failure) {
                  setStep((current) => current + 1);
                }
              }}
            >
              המשך
            </button>
          ) : (
            <button
              className="primary"
              type="button"
              disabled={busy || uncertain}
              onClick={() => {
                void save();
              }}
            >
              {busy ? 'שומרים…' : 'שמירת טיוטה והמשך לאישור'}
            </button>
          )}
        </footer>
      </div>
    </section>
  );
}
