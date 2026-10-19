import { BUSINESS_WEB_TOKENS as TOKENS } from '@/lib/design/businessWebTokens';

type Program = {
  loyaltyProgramId: string;
  title: string;
  rewardName?: string;
  maxStamps?: number;
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
        .sx-programs{display:grid;grid-template-columns:repeat(auto-fill,minmax(136px,1fr));gap:8px;margin:12px 0;padding:0;border:0;min-width:0}
        .sx-programs legend{padding:0;margin-bottom:8px;color:${TOKENS.colors.textPrimary};font-weight:600}
        .sx-programs button{display:flex;flex-direction:column;align-items:flex-start;gap:6px;min-height:108px;min-width:0;padding:12px;border:2px solid ${TOKENS.colors.success};border-radius:${TOKENS.radii.md}px;background:${TOKENS.colors.elevatedSurface};color:${TOKENS.colors.textPrimary};font:inherit;text-align:right;cursor:pointer;overflow-wrap:anywhere}
        .sx-programs button[aria-pressed=true]{border-color:${TOKENS.colors.primary};background:${TOKENS.colors.primarySubtle}}
        .sx-programs button:disabled{cursor:default;opacity:.65}
        .sx-programs small{color:${TOKENS.colors.success};font-weight:600}
        .sx-programs span{color:${TOKENS.colors.textSecondary};font-size:13px}
      `}</style>
      {recoveryId &&
      !programs.some((p) => p.loyaltyProgramId === recoveryId) ? (
        <button type="button" disabled={true} aria-pressed={true}>
          בירור הפעולה הקודמת
        </button>
      ) : null}
      {programs.map((program) => (
        <button
          type="button"
          key={program.loyaltyProgramId}
          disabled={disabled}
          aria-pressed={selectedId === program.loyaltyProgramId}
          onClick={() => onSelect(program.loyaltyProgramId)}
        >
          <strong>{program.title}</strong>
          <span>
            {program.maxStamps} חותמות
            {program.rewardName ? ` · ${program.rewardName}` : ''}
          </span>
          <small>
            ✓ פעילה
            {selectedId === program.loyaltyProgramId ? ' · נבחרה לסריקה' : ''}
          </small>
        </button>
      ))}
    </fieldset>
  );
}
