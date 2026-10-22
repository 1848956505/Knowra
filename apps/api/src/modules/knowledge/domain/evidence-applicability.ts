export interface EvidenceApplicabilityInput {
  applicabilityStatus?: string | null;
  status?: string | null;
}

export const EVIDENCE_APPLICABILITY = Object.freeze({
  ACTIVE: 'active',
  WITHDRAWN: 'withdrawn',
  NEEDS_REVIEW: 'needsReview'
});

export function legacyEvidenceApplicability(evidence: EvidenceApplicabilityInput): string {
  return (
    evidence.applicabilityStatus ??
    (evidence.status === 'invalid' ? EVIDENCE_APPLICABILITY.NEEDS_REVIEW : EVIDENCE_APPLICABILITY.ACTIVE)
  );
}

export function isEvidenceUsable(evidence: EvidenceApplicabilityInput | null | undefined): boolean {
  return evidence?.status === 'valid' && legacyEvidenceApplicability(evidence) === EVIDENCE_APPLICABILITY.ACTIVE;
}
