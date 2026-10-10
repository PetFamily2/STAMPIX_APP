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
