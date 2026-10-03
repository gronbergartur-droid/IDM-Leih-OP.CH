import type { AiConfirmationAction, RepairAiSuggestion } from '@/types/database';

export interface RepairIdentity {
  instrumentName: string;
  refNumber: string | null;
}

export interface AiConfirmationOverride {
  instrumentName?: string;
  refNumber?: string | null;
}

/**
 * Computes the final (instrumentName, refNumber) a repair case should carry
 * after a human acts on an AI suggestion - pure so it's independently
 * testable from the two DataProvider implementations that both need it.
 *
 * - 'accepted': copies the AI's candidate values verbatim.
 * - 'corrected' / 'other_instrument': uses the human-provided override.
 * - 'rejected': keeps whatever was already on the case - the AI proposal
 *   itself is never deleted (see RepairCase.aiSuggestion), just not acted on.
 */
export function resolveAiConfirmation(
  existing: RepairIdentity,
  aiSuggestion: RepairAiSuggestion | null,
  action: AiConfirmationAction,
  override: AiConfirmationOverride | null,
): RepairIdentity {
  if (action === 'accepted') {
    if (!aiSuggestion) return existing;
    return { instrumentName: aiSuggestion.instrumentCandidate, refNumber: aiSuggestion.refCandidate };
  }
  if (action === 'corrected' || action === 'other_instrument') {
    return {
      instrumentName: override?.instrumentName?.trim() || existing.instrumentName,
      refNumber: override?.refNumber !== undefined ? override.refNumber : existing.refNumber,
    };
  }
  // 'rejected'
  return existing;
}
