import { useMutation, usePaginatedQuery, useQuery } from 'convex/react';
import { useState } from 'react';
import { SYSTEM_TEAM_STYLES } from '@/components/system-team/SystemTeamWorkspace.web';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';

const roleLabel = { service: 'שירות', sales: 'מכירות' };
const statusLabel = {
  invited: 'ממתין להצטרפות',
  active: 'פעיל',
  suspended: 'מושהה',
  revoked: 'הגישה בוטלה',
};
const eventLabel: Record<string, string> = {
  invited: 'נוצרה הזמנה',
  accepted: 'ההזמנה אושרה',
  active: 'הגישה חודשה',
  suspended: 'הגישה הושהתה',
  revoked: 'הגישה בוטלה',
  assigned: 'הוקצתה משימה',
  task_updated: 'עודכנה משימה',
  support_closed: 'נסגרה פניית תמיכה',
};
export function SystemTeamAdmin() {
  const members = usePaginatedQuery(
    api.systemTeam.listMembers,
    {},
    { initialNumItems: 20 }
  );
  const invite = useMutation(api.systemTeam.invite);
  const setStatus = useMutation(api.systemTeam.setMemberStatus);
  const assign = useMutation(api.systemTeam.assign);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'service' | 'sales'>('service');
  const [memberId, setMemberId] = useState<Id<'systemTeamMembers'>>();
  const [kind, setKind] = useState<'business' | 'support'>('business');
  const [term, setTerm] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const targets = useQuery(
    api.systemTeam.assignmentTargets,
    memberId ? { kind, term } : 'skip'
  );
  const trail = useQuery(
    api.systemTeam.auditTrail,
    memberId ? { memberId } : 'skip'
  );
  const selected = members.results.find((member) => member.id === memberId);
  const run = async (work: () => Promise<unknown>, success: string) => {
    if (busy) {
      return;
    }
    setBusy(true);
    setMessage('');
    try {
      await work();
      setMessage(success);
    } catch {
      setMessage('הפעולה לא אושרה. רעננו את הרשימה לפני ניסיון נוסף.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <main className="sx-system-team" dir="rtl">
      <style>{SYSTEM_TEAM_STYLES}</style>
      <h1>עובדי מערכת</h1>
      <p>
        הזמנה לתפקיד מוגבל מחייבת כניסה באימייל המאומת של המוזמן ואישור שלו.
        אינה מעניקה הרשאת מנהל מערכת, תשלום, מחיקה או התחזות.
      </p>
      <section>
        <h2>הזמנת עובד</h2>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void run(
              () => invite({ email, role }),
              'ההזמנה מוכנה. שתפו עם העובד את הקישור למרכז העובדים. לא נשלח דוא״ל אוטומטי.'
            );
          }}
        >
          <label>
            אימייל לעבודה
            <input
              type="email"
              autoComplete="off"
              required={true}
              maxLength={254}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>
          <label>
            תפקיד
            <select
              value={role}
              onChange={(event) =>
                setRole(event.target.value as 'service' | 'sales')
              }
            >
              <option value="service">שירות — פניות ועסקים שהוקצו</option>
              <option value="sales">מכירות — עסקים שהוקצו בלבד</option>
            </select>
          </label>
          <button type="submit" disabled={busy}>
            הכנת הזמנה
          </button>
        </form>
        <a href="/system-team" target="_blank" rel="noopener noreferrer">
          פתיחת מרכז העובדים לשיתוף
        </a>
      </section>
      {message ? <p role="alert">{message}</p> : null}
      <section>
        <h2>חברי צוות והרשאות</h2>
        {members.results.map((member) => (
          <article key={member.id}>
            <div>
              <strong>{member.email}</strong>
              <p>
                {roleLabel[member.role]} · {statusLabel[member.status]}
              </p>
            </div>
            <div className="actions">
              {member.status === 'active' ? (
                <>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      setMemberId(member.id);
                      setKind('business');
                    }}
                  >
                    הקצאת משימה ותיעוד
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      void run(
                        () =>
                          setStatus({
                            memberId: member.id,
                            status: 'suspended',
                          }),
                        'הגישה הושהתה.'
                      );
                    }}
                  >
                    השעיה
                  </button>
                </>
              ) : null}
              {member.status === 'suspended' ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    void run(
                      () =>
                        setStatus({ memberId: member.id, status: 'active' }),
                      'הגישה חודשה.'
                    );
                  }}
                >
                  חידוש גישה
                </button>
              ) : null}
              {member.status !== 'revoked' ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    void run(
                      () =>
                        setStatus({ memberId: member.id, status: 'revoked' }),
                      'הגישה בוטלה. הזמנה חדשה תדרוש אישור חדש.'
                    );
                  }}
                >
                  ביטול גישה
                </button>
              ) : null}
            </div>
          </article>
        ))}
        {members.status === 'LoadingFirstPage' ? (
          <output>טוענים צוות…</output>
        ) : null}
        {members.status === 'CanLoadMore' ? (
          <button type="button" onClick={() => members.loadMore(20)}>
            עובדים נוספים
          </button>
        ) : null}
      </section>
      {selected?.status === 'active' ? (
        <section>
          <h2>הקצאה עבור {selected.email}</h2>
          <p>
            העובד יראה רק את הרשומה שתבחרו. פנייה עשויה להכיל פרטי קשר ומידע
            שהלקוח מסר; הקצו אותה רק לאיש שירות מתאים.
          </p>
          <label>
            סוג משימה
            <select
              value={kind}
              onChange={(event) =>
                setKind(event.target.value as 'business' | 'support')
              }
            >
              <option value="business">מעקב עסק</option>
              {selected.role === 'service' ? (
                <option value="support">פניית תמיכה</option>
              ) : null}
            </select>
          </label>
          {kind === 'business' ? (
            <label>
              חיפוש עסק
              <input
                value={term}
                maxLength={120}
                onChange={(event) => setTerm(event.target.value)}
                placeholder="לפחות שני תווים"
              />
            </label>
          ) : null}
          {targets?.map((target) => (
            <article key={target.id}>
              <div>
                <strong>{target.title}</strong>
                <p>{target.detail}</p>
              </div>
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  void run(
                    () =>
                      assign({
                        memberId: selected.id,
                        target:
                          kind === 'business'
                            ? {
                                kind,
                                businessId: target.id as Id<'businesses'>,
                              }
                            : {
                                kind,
                                supportRequestId:
                                  target.id as Id<'supportRequests'>,
                              },
                      }),
                    'המשימה הוקצתה.'
                  );
                }}
              >
                הקצאה
              </button>
            </article>
          ))}
          <h3>פעולות אחרונות</h3>
          <ul>
            {trail?.map((event) => (
              <li key={event.id}>
                {eventLabel[event.event] ?? event.event} · {event.actorName} ·{' '}
                {new Date(event.createdAt).toLocaleString('he-IL')}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </main>
  );
}
