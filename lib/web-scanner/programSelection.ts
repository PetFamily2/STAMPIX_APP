export type ScannerProgramSelection = {
  scopeKey: string;
  programId: string;
  receiptReview?: boolean;
};

/** Preserve the viewed program after a canonical receipt clears recovery metadata. */
export function retainRecoverySelection(
  selection: ScannerProgramSelection,
  scopeKey: string,
  pending: string | null
): ScannerProgramSelection {
  if (
    !pending ||
    (selection.scopeKey === scopeKey &&
      selection.programId === pending &&
      selection.receiptReview === true)
  )
    return selection;
  return { scopeKey, programId: pending, receiptReview: true };
}

const REMEMBERED_PROGRAM_PREFIX = 'stampaix:web-scanner-program:';

/** The last card used for this account and business, otherwise the first available card. */
export function rememberedScannerProgram(
  scopeKey: string,
  available: readonly string[],
  storage: Pick<Storage, 'getItem'> | null
) {
  if (!scopeKey || available.length === 0) return null;
  try {
    const saved = storage?.getItem(REMEMBERED_PROGRAM_PREFIX + scopeKey);
    if (saved && available.includes(saved)) return saved;
  } catch {
    // Storage can be blocked; the first card still opens the scanner.
  }
  return available[0] ?? null;
}

export function rememberScannerProgram(
  scopeKey: string,
  programId: string,
  storage: Pick<Storage, 'setItem'> | null
) {
  if (!scopeKey || !programId) return;
  try {
    storage?.setItem(REMEMBERED_PROGRAM_PREFIX + scopeKey, programId);
  } catch {
    // A blocked write only means the choice is kept for this visit.
  }
}

/** Recovery stays readable even if the program is no longer available for new scans. */
export function selectedScannerProgram(
  selection: ScannerProgramSelection,
  scopeKey: string,
  pending: string | null,
  available: readonly string[]
): string | null {
  if (pending) return pending;
  return selection.scopeKey === scopeKey &&
    (selection.receiptReview === true ||
      available.includes(selection.programId))
    ? selection.programId
    : null;
}
