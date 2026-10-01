/**
 * UX-only confidence tiers for a Cloud Agent suggestion (master prompt
 * section 4 "Confidence policy"). These never express medical/operational
 * certainty - every tier still requires an explicit human action
 * (Übernehmen/Korrigieren/Anderes Instrument/Ablehnen) before anything is
 * stored as confirmed.
 */
export type ConfidenceTier = 'strong' | 'confirm' | 'manual';

export function confidenceTier(confidence: number): ConfidenceTier {
  if (confidence >= 98) return 'strong';
  if (confidence >= 90) return 'confirm';
  return 'manual';
}

export const CONFIDENCE_TIER_LABEL: Record<ConfidenceTier, string> = {
  strong: 'Starker Vorschlag',
  confirm: 'Bestätigung erforderlich',
  manual: 'Manuelle Auswahl empfohlen',
};
