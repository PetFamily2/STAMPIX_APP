import { resolveCardTheme } from '@/constants/cardThemes';
import { resolveStampIcon } from '@/constants/stampIcons';
import { BUSINESS_WEB_TOKENS as TOKENS } from '@/lib/design/businessWebTokens';

function StampMark({ id, color }: { id: string; color: string }) {
  const common = {
    width: 28,
    height: 28,
    viewBox: '0 0 24 24',
    fill: color,
    'aria-hidden': true as const,
  };
  if (id === 'coffee') {
    return (
      <svg {...common}>
        <path d="M6 8h9a3 3 0 0 1 0 6H8v2h8v2H6V8zm11 1.5V13a2 2 0 0 0 0-3.5zM7 4h2v2H7zm4 0h2v2h-2z" />
      </svg>
    );
  }
  if (id === 'gift') {
    return (
      <svg {...common}>
        <path d="M4 10h16v9H4zm7-6l2 3h-2zm2 0l2 3h-2zM11 10v9h2v-9z" />
      </svg>
    );
  }
  if (id === 'heart') {
    return (
      <svg {...common}>
        <path d="M12 20s-7-4.4-7-9a4 4 0 0 1 7-2 4 4 0 0 1 7 2c0 4.6-7 9-7 9z" />
      </svg>
    );
  }
  if (id === 'food') {
    return (
      <svg {...common}>
        <path d="M7 3v8a2 2 0 0 0 2 2h1v8h2v-8h1a2 2 0 0 0 2-2V3h-2v6h-1V3h-2v6H9V3z" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <path d="M12 3l2.2 4.6L19 8.2l-3.5 3.4.8 4.9L12 14.8 7.7 16.5l.8-4.9L5 8.2l4.8-.6z" />
    </svg>
  );
}

type Program = {
  loyaltyProgramId: string;
  title: string;
  rewardName?: string;
  maxStamps?: number;
  stampIcon?: string | null;
  cardThemeId?: string | null;
};

export function ScannerProgramTiles({
  programs,
  selectedId,
  disabled,
  recoveryId,
  onSelect,
}: {
  programs: readonly Program[];
  selectedId: string | null;
  disabled: boolean;
  recoveryId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <fieldset aria-label="בחירת כרטיסייה לסריקה" className="sx-programs">
      <legend>כרטיסיות פעילות לסריקה</legend>
      <style>{`
        .sx-programs{display:grid;grid-template-columns:repeat(auto-fill,minmax(104px,1fr));gap:8px;margin:12px 0;padding:0;border:0;min-width:0}
        .sx-programs legend{padding:0;margin-bottom:8px;color:${TOKENS.colors.textPrimary};font-weight:600}
        .sx-programs button{position:relative;display:flex;flex-direction:column;align-items:center;justify-content:flex-start;gap:4px;height:112px;min-width:0;padding:8px 6px;border:3px solid transparent;border-radius:13px;font:inherit;text-align:center;cursor:pointer;overflow:hidden}
        .sx-programs button:disabled{cursor:default;opacity:.65}
        .sx-programs strong{width:100%;font-size:13px;line-height:16px;font-weight:800;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
        .sx-programs span,.sx-programs small{width:100%;font-size:11px;line-height:14px}
        .sx-programs .sx-mark{position:absolute;top:6px;right:6px;width:16px;height:16px;border-radius:8px;background:#2F6BFF;color:#fff;font-size:11px;line-height:16px}
      `}</style>
      {recoveryId &&
      !programs.some((p) => p.loyaltyProgramId === recoveryId) ? (
        <button type="button" disabled={true} aria-pressed={true}>
          בירור הפעולה הקודמת
        </button>
      ) : null}
      {programs.map((program) => {
        const theme = resolveCardTheme(program.cardThemeId);
        const icon = resolveStampIcon(program.stampIcon);
        const selected = selectedId === program.loyaltyProgramId;
        return (
          <button
            type="button"
            key={program.loyaltyProgramId}
            disabled={disabled}
            data-active="true"
            aria-pressed={selected}
            aria-label={`בחירת כרטיסייה ${program.title}`}
            onClick={() => onSelect(program.loyaltyProgramId)}
            style={{
              background: `linear-gradient(135deg, ${theme.gradient[0]}, ${theme.gradient[1]} 58%, ${theme.gradient[2]})`,
              borderColor: selected ? '#2F6BFF' : theme.keyline,
              color: theme.titleColor,
            }}
          >
            {selected ? <span className="sx-mark">✓</span> : null}
            <StampMark id={icon.id} color={theme.accent} />
            <strong>{program.title}</strong>
            <span style={{ color: theme.subtitleColor }}>
              {program.maxStamps} חותמות
              {program.rewardName ? ` · ${program.rewardName}` : ''}
            </span>
            <small style={{ color: theme.accent }}>
              ✓ פעילה
              {selected ? ' · נבחרה לסריקה' : ''}
            </small>
          </button>
        );
      })}
    </fieldset>
  );
}
