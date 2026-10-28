import { useMutation, usePaginatedQuery, useQuery } from 'convex/react';
import { useState } from 'react';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { BUSINESS_WEB_TOKENS as T } from '@/lib/design/businessWebTokens';

export const SYSTEM_TEAM_STYLES = `.sx-system-team{font:16px/1.65 Heebo,Arial,sans-serif;color:${T.colors.textPrimary};max-width:1000px;margin:auto;padding:24px 20px}.sx-system-team *{box-sizing:border-box}.sx-system-team section{padding:20px;background:white;border:1px solid ${T.colors.border};border-radius:16px;display:grid;gap:16px;margin:20px 0}.sx-system-team h1{font-size:26px}.sx-system-team h2{font-size:20px}.sx-system-team p{margin:0;color:${T.colors.textSecondary};overflow-wrap:anywhere}.sx-system-team label{display:grid;gap:8px}.sx-system-team form{display:grid;gap:16px}.sx-system-team input,.sx-system-team select,.sx-system-team textarea{font:inherit;min-height:48px;padding:10px 14px;border:1px solid ${T.colors.borderStrong};border-radius:12px;background:white;color:inherit;width:100%}.sx-system-team button,.sx-system-team a{font:600 15px Heebo,Arial,sans-serif;min-height:48px;padding:10px 16px;border:1px solid ${T.colors.primary};color:${T.colors.primary};background:white;border-radius:12px;cursor:pointer;text-decoration:none;display:inline-flex;align-items:center;justify-content:center}.sx-system-team button:disabled{opacity:.5;cursor:default}.sx-system-team article{padding:16px 0;border-bottom:1px solid ${T.colors.border};display:grid;gap:12px}.sx-system-team strong{overflow-wrap:anywhere}.sx-system-team .actions{display:flex;gap:12px;flex-wrap:wrap}.sx-system-team :focus-visible{outline:3px solid ${T.colors.primary};outline-offset:3px}.sx-system-team [role=alert]{padding:12px;background:${T.colors.primarySubtle}}`;

export function SystemTeamWorkspace() {
  const viewer = useQuery(api.systemTeam.viewer, {});
  const accept = useMutation(api.systemTeam.acceptInvite);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <main className="sx-system-team" dir="rtl">
      <style>{SYSTEM_TEAM_STYLES}</style>
      <h1>מרכז עובדי StampAix</h1>
      <p>
        מרכז שירות ומכירות למשימות שהוקצו לחשבון שלכם. גישה למועדוני לקוחות,
        תשלומים, מחיקה או התחזות אינה כלולה בתפקיד.
      </p>
      {viewer === undefined ? <output>בודקים הרשאות…</output> : null}
      {viewer?.invitations.map((invite) => (
        <section key={invite.id}>
          <h2>הזמנה לתפקיד {invite.role === 'service' ? 'שירות' : 'מכירות'}</h2>
          <p>
            {invite.email} · ההזמנה בתוקף עד{' '}
            {new Date(invite.expiresAt ?? 0).toLocaleDateString('he-IL')}.
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setMessage('');
              try {
                await accept({ memberId: invite.id });
              } catch {
                setMessage(
                  'לא ניתן לאשר את ההזמנה. ודאו שנכנסתם באימייל המאומת שאליו הוזמנתם, או פנו למנהל המערכת.'
                );
              } finally {
                setBusy(false);
              }
            }}
          >
            אישור ההזמנה והצטרפות לתפקיד
          </button>
        </section>
      ))}
      {viewer?.member ? (
        <TaskList />
      ) : viewer && viewer.invitations.length === 0 ? (
        <section>
          <h2>אין גישה פעילה</h2>
          <p>
            התחברו עם האימייל שאליו הוזמנתם ואמתו אותו. אם הגישה הושהתה או
            בוטלה, רק מנהל המערכת יכול לחדש אותה.
          </p>
        </section>
      ) : null}
      {viewer?.administrator ? (
        <a href="/admin?view=team">ניהול עובדי מערכת</a>
      ) : null}
      {message ? <p role="alert">{message}</p> : null}
      <a href="/welcome">חזרה ל־StampAix</a>
    </main>
  );
}

function TaskList() {
  const [status, setStatus] = useState<'open' | 'in_progress' | 'resolved'>(
    'open'
  );
  const tasks = usePaginatedQuery(
    api.systemTeam.assignedTasks,
    { status },
    { initialNumItems: 20 }
  );
  return (
    <section>
      <h2>המשימות שלי</h2>
      <label>
        סינון לפי מצב
        <select
          value={status}
          onChange={(event) => setStatus(event.target.value as typeof status)}
        >
          <option value="open">פתוחות</option>
          <option value="in_progress">בטיפול</option>
          <option value="resolved">טופלו</option>
        </select>
      </label>
      {tasks.results.map((task) => (
        <AssignedTask key={`${task.id}:${task.updatedAt}`} task={task} />
      ))}
      {tasks.status === 'LoadingFirstPage' ? (
        <output>טוענים משימות…</output>
      ) : tasks.results.length === 0 ? (
        <p>אין משימות במצב הזה.</p>
      ) : null}
      {tasks.status === 'CanLoadMore' ? (
        <button type="button" onClick={() => tasks.loadMore(20)}>
          משימות נוספות
        </button>
      ) : null}
    </section>
  );
}

type Task = {
  id: Id<'systemTeamAssignments'>;
  kind: 'business' | 'support';
  status: 'open' | 'in_progress' | 'resolved';
  note: string;
  updatedAt: number;
  title: string;
  detail: string;
  contact: string;
  targetAvailable: boolean;
};
function AssignedTask({ task }: { task: Task }) {
  const update = useMutation(api.systemTeam.updateTask);
  const [note, setNote] = useState(task.note);
  const [status, setStatus] = useState(task.status);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const save = async (closeSupport: boolean) => {
    if (busy) {
      return;
    }
    setBusy(true);
    setMessage('');
    try {
      await update({
        taskId: task.id,
        note,
        status: closeSupport ? 'resolved' : status,
        expectedUpdatedAt: task.updatedAt,
        closeSupport,
      });
      setMessage('נשמר.');
    } catch {
      setMessage(
        'לא ניתן לשמור. ייתכן שהמשימה השתנתה או שהגישה בוטלה. רעננו לפני ניסיון נוסף.'
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <article>
      <h3>{task.title}</h3>
      <p>{task.detail}</p>
      {task.contact ? <p dir="auto">{task.contact}</p> : null}
      <label>
        הערה פנימית
        <textarea
          value={note}
          maxLength={1200}
          rows={3}
          onChange={(event) => setNote(event.target.value)}
        />
      </label>
      <p>
        ההערה נשארת פנימית. אין להוסיף סודות, פרטי אשראי או מידע רגיש שאינו נחוץ
        לטיפול.
      </p>
      <label>
        מצב משימה
        <select
          value={status}
          onChange={(event) => setStatus(event.target.value as typeof status)}
        >
          <option value="open">פתוחה</option>
          <option value="in_progress">בטיפול</option>
          <option value="resolved">טופלה</option>
        </select>
      </label>
      <div className="actions">
        <button
          type="button"
          disabled={busy || !task.targetAvailable}
          onClick={() => {
            void save(false);
          }}
        >
          שמירה
        </button>
        {task.kind === 'support' && task.status !== 'resolved' ? (
          <button
            type="button"
            disabled={busy || !task.targetAvailable}
            onClick={() => {
              void save(true);
            }}
          >
            סיום טיפול בפנייה
          </button>
        ) : null}
      </div>
      {message ? <p role="alert">{message}</p> : null}
    </article>
  );
}
