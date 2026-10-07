import type { MouseEvent } from 'react';

/** Public copy only. The exported document and client route share this markup. */
export const welcomeStyles = `
.public-welcome{box-sizing:border-box;min-height:100vh;min-height:100dvh;max-width:620px;margin:auto;padding:32px 24px;color:#14213d;background:#fff;font-family:Heebo,Arial,sans-serif;text-align:center;direction:rtl;display:flex;flex-direction:column}
.public-welcome *{box-sizing:border-box}.public-welcome img{display:block;object-fit:contain;margin:0 auto 8px}.public-welcome h1{font-size:30px;line-height:1.35;margin:8px 0 12px;font-weight:900}.public-welcome h1 span{color:#2563eb}.public-welcome .subtitle{color:#596272;font-size:16px;line-height:1.6;margin:0 0 28px}
.public-welcome .benefits{border:1px solid #dbe7fb;border-radius:24px;box-shadow:0 9px 22px #2563eb12;text-align:right;margin-bottom:28px}.public-welcome section{padding:20px;display:flex;align-items:center;gap:12px}.public-welcome section+section{border-top:1px solid #dbe7fb}.public-welcome h2{font-size:13px;color:#2563eb;margin:0 0 5px}.public-welcome section p{font-size:15px;line-height:1.5;margin:0;font-weight:600}.public-welcome svg{flex:none;background:#eaf2ff;border-radius:50%;padding:10px;width:44px;height:44px;color:#2563eb}
.public-welcome nav{margin-top:auto}.public-welcome a{display:inline-flex;align-items:center;justify-content:center;min-height:44px;color:#2459c5;font-weight:700;text-decoration:none;padding:8px}.public-welcome .start{display:flex;background:#2563eb;color:white;min-height:54px;border-radius:16px;margin-bottom:12px}.public-welcome a:focus-visible{outline:3px solid #14213d;outline-offset:4px}.public-welcome .back{align-self:flex-start;margin-bottom:6px}.public-welcome .entry{display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:4px;font-size:16px}.public-welcome .entry span{color:#596272}
@media(max-width:360px){.public-welcome{padding:20px 16px}.public-welcome h1{font-size:28px}.public-welcome section{padding:16px}}
`;

type Props = {
  onNavigate?: (
    event: MouseEvent<HTMLAnchorElement>,
    href: '/sign-in' | '/sign-up'
  ) => void;
};

export function WelcomeContent({ onNavigate }: Props) {
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
