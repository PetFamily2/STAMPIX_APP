import type { MouseEvent } from 'react';

/** Public copy only. The exported document and client route share this markup. */
export const welcomeStyles = `
.public-welcome{box-sizing:border-box;min-height:100vh;min-height:100dvh;max-width:640px;margin:auto;padding:28px 20px;color:#101936;background:#F3F5F9;font-family:Heebo,Arial,sans-serif;text-align:center;direction:rtl;display:flex;flex-direction:column}
.public-welcome *{box-sizing:border-box}.public-welcome img{display:block;object-fit:contain;margin:0 auto 8px}.public-welcome h1{font-size:28px;line-height:1.3;margin:8px 0 10px;font-weight:600}.public-welcome h1 span{color:#1230A8}.public-welcome .subtitle{color:#475569;font-size:15px;line-height:1.55;margin:0 0 24px;font-weight:400}
.public-welcome .benefits{display:grid;gap:14px;text-align:right;margin-bottom:24px}.public-welcome section{padding:18px;display:flex;align-items:center;gap:14px;background:#fff;border:1px solid #DFE5F0;border-radius:18px;box-shadow:0 3px 12px #10193605}.public-welcome h2{font-size:15px;color:#1230A8;margin:0 0 5px;font-weight:600}.public-welcome section p{font-size:15px;line-height:1.5;margin:0;font-weight:400;color:#334155}.public-welcome svg{flex:none;background:#EEF4FF;border-radius:14px;padding:11px;width:48px;height:48px;color:#1230A8}
.public-welcome nav{margin-top:auto}.public-welcome a{display:inline-flex;align-items:center;justify-content:center;min-height:44px;color:#1230A8;font-weight:600;text-decoration:none;padding:8px}.public-welcome .start{display:flex;background:#1230A8;color:white;min-height:48px;border-radius:12px;margin-bottom:12px;font-weight:600}.public-welcome a:focus-visible{outline:3px solid #1230A8;outline-offset:3px}.public-welcome .back{align-self:flex-start;margin-bottom:6px}.public-welcome .entry{display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:4px;font-size:15px}.public-welcome .entry span{color:#475569}
@media(max-width:360px){.public-welcome{padding:16px}.public-welcome h1{font-size:24px}.public-welcome section{padding:14px}}
`;

type Props = {
  manualQa?: boolean;
  onNavigate?: (
    event: MouseEvent<HTMLAnchorElement>,
    href: '/sign-in' | '/sign-up' | '/preview-qa'
  ) => void;
};

export function WelcomeContent({ onNavigate, manualQa = false }: Props) {
  return (
    <>
      <style>{welcomeStyles}</style>
      <main className="public-welcome" data-public-welcome="true">
        <a
          className="back"
          href="/sign-in"
          aria-label="חזרה לכניסה"
          onClick={(event) => onNavigate?.(event, '/sign-in')}
        >
          חזרה
        </a>
        <img
          src="/pwa/welcome-logo.webp"
          width={128}
          height={128}
          alt="StampAix logo"
          fetchPriority="high"
        />
        <h1>
          העסק והלקוחות
          <br />
          נפגשים ב<span>דיגיטל</span>
        </h1>
        <p className="subtitle">כל כרטיסי הנאמנות וההטבות במקום אחד</p>
        <div className="benefits">
          <section>
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M3 8h18v4H3zM5 12v9h14v-9M12 8v13M12 8H8a3 3 0 1 1 3-3l1 3Zm0 0h4a3 3 0 1 0-3-3l-1 3Z" />
            </svg>
            <div>
              <h2>ללקוחות</h2>
              <p>צוברים חותמות, מממשים הטבות ונהנים יותר בכל ביקור</p>
            </div>
          </section>
          <section>
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="m4 3-2 6v3h20V9l-2-6ZM4 12v9h16v-9M9 21v-6h6v6" />
            </svg>
            <div>
              <h2>לעסקים</h2>
              <p>מנהלים מועדון לקוחות חכם, מחזירים לקוחות ומחזקים נאמנות</p>
            </div>
          </section>
        </div>
        <nav aria-label="כניסה והרשמה">
          {manualQa ? (
            <a
              className="start"
              href="/preview-qa"
              onClick={(event) => onNavigate?.(event, '/preview-qa')}
            >
              כניסה לבדיקות
            </a>
          ) : null}
          <a
            className="start"
            href="/sign-up"
            onClick={(event) => onNavigate?.(event, '/sign-up')}
          >
            בואו נתחיל
          </a>
          <div className="entry">
            <span>יש לכם כבר אימייל?</span>
            <a
              href="/sign-in"
              onClick={(event) => onNavigate?.(event, '/sign-in')}
            >
              כניסה או הרשמה באימייל
            </a>
          </div>
        </nav>
      </main>
    </>
  );
}
