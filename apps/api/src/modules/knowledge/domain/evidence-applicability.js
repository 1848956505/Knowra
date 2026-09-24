export const EVIDENCE_APPLICABILITY = Object.freeze({
  ACTIVE: 'active',
  WITHDRAWN: 'withdrawn',
  NEEDS_REVIEW: 'needsReview'
});

export function legacyEvidenceApplicability(evidence) {
  return evidence.applicabilityStatus
    ?? (evidence.status === 'invalid' ? EVIDENCE_APPLICABILITY.NEEDS_REVIEW : EVIDENCE_APPLICABILITY.ACTIVE);
}

export function isEvidenceUsable(evidence) {
  return evidence?.status === 'valid'
    && legacyEvidenceApplicability(evidence) === EVIDENCE_APPLICABILITY.ACTIVE;
}
