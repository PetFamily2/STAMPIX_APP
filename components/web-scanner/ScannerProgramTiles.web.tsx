import { resolveStampIcon } from '@/constants/stampIcons';
import { resolveClassicStampPalette } from '@/lib/loyalty/classicStampPalette';
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
        .sx-programs{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:8px;margin:0 0 12px;padding:0;border:0;min-width:0}
        .sx-programs legend{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
        .sx-programs button{position:relative;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;height:112px;min-width:0;padding:8px 4px;border:3px solid transparent;border-radius:13px;font:inherit;text-align:center;cursor:pointer;overflow:hidden}
        .sx-programs button:disabled{cursor:default;opacity:.65}
        .sx-programs svg{display:block;width:22px;height:22px;flex:0 0 auto}
        .sx-programs strong{width:100%;font-size:12px;line-height:15px;font-weight:800;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
        .sx-programs span,.sx-programs small{width:100%;font-size:11px;line-height:14px}
      `}</style>
      {recoveryId &&
      !programs.some((p) => p.loyaltyProgramId === recoveryId) ? (
        <button type="button" disabled={true} aria-pressed={true}>
          בירור הפעולה הקודמת
        </button>
      ) : null}
      {programs.map((program) => {
        const palette = resolveClassicStampPalette(program.cardThemeId);
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
              background: palette.paper,
              borderColor: selected ? '#047857' : 'transparent',
              borderWidth: selected ? 5 : 3,
              color: palette.ink,
            }}
          >
            <StampMark id={icon.id} color={palette.ink} />
            <strong style={{ color: palette.ink }}>{program.title}</strong>
            <span style={{ color: palette.mute }}>
              {program.maxStamps} חותמות
              {program.rewardName ? ` · ${program.rewardName}` : ''}
            </span>
          </button>
        );
      })}
    </fieldset>
  );
}
