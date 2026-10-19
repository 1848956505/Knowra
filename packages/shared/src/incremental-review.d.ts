export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
export interface ReviewConcept { id: string; name: string; sense: string }
export interface ReviewItem { id: string; conceptId: string; title: string; kind: 'definition' | 'fact' | 'procedure' | 'application'; statement: string }
export interface ReviewOriginal {
  conceptAction: 'reuse' | 'create'; conceptId: string | null; newConcept: { name: string; sense: string } | null;
  possibleDuplicateOf: string | null; itemAction: 'new' | 'reuse'; existingItemId: string | null;
  item: { title: string; kind: ReviewItem['kind']; statement: string; quote: string }; sourceIssue: string | null;
}
export type ReviewProposal = {
  proposalId: string; originalIndex: number; heldByProposalIndices: number[];
} & ({ validationAccepted: true; validationErrors: []; original: ReviewOriginal }
  | { validationAccepted: false; validationErrors: string[]; original: JsonValue });
export interface ReviewRow {
  rowId: string; requestId: string; arm: 'retrieval' | 'oracle';
  note: { id: string; markdown: string; candidates?: string[] };
  candidateConcepts: ReviewConcept[]; candidateItems: ReviewItem[]; providerResult: JsonValue;
  responseState: 'proposals' | 'no_proposals' | 'invalid_response' | 'provider_failure';
  explanation: null | { kind: 'model-explanation-unverified'; text: string; nativeAbstain: false; nextAction: 'inspect-or-clarify' };
  proposals: ReviewProposal[];
}
export interface ReviewEnvelope {
  kind: 'knowra.incremental-review'; version: 1; reportId: string; snapshotRef: string;
  approval: 'not-granted'; semanticSafety: 'not-verified'; rows: ReviewRow[];
}
export type ReviewDecision = { kind: 'defer' } | { kind: 'existing'; conceptId: string } | { kind: 'new'; name: string; sense: string };
export type ReviewSession = Readonly<Record<string, ReviewDecision>>;
export type HoldReason = 'validation-rejected' | 'reported-risk' | 'risk-dependency' | 'item-reuse-not-supported';
export interface ReviewDraft {
  kind: 'knowra.incremental-review-draft'; version: 1; approval: 'not-granted'; semanticSafety: 'not-verified';
  report: ReviewEnvelope; decisions: { proposalId: string; holdReasons: HoldReason[]; decision: ReviewDecision | { kind: 'undecided' } }[];
  counts: { total: number; undecided: number; deferred: number; selected: number };
}
export const REVIEW_LIMITS: Readonly<{ bytes: number; rows: number; proposals: number; concepts: number; items: number;
  id: number; title: number; name: number; sense: number; note: number; text: number; rawText: number; depth: number; nodes: number; statement: number; sourceIssue: number; linksPerRow: number; simulationWork: number; similarityWork: number }>;
export const REVIEW_KIND: 'knowra.incremental-review';
export const DRAFT_KIND: 'knowra.incremental-review-draft';
export const REVIEW_VERSION: 1;
export class ReviewContractError extends Error { path: string; code: string; constructor(path: string, code: string) }
export function proposalKey(reportId: string, rowId: string, index: number): string;
export function holdReasons(proposal: ReviewProposal): HoldReason[];
export function validateReviewEnvelope(value: unknown): ReviewEnvelope;
export function parseReviewEnvelope(input: string): ReviewEnvelope;
export function decideReview(envelope: ReviewEnvelope, session: ReviewSession, proposalId: string, decision: ReviewDecision): ReviewSession;
export function undoReview(envelope: ReviewEnvelope, session: ReviewSession, proposalId: string): ReviewSession;
export function createReviewDraft(envelope: ReviewEnvelope, session: ReviewSession): ReviewDraft;
export function serializeReviewDraft(envelope: ReviewEnvelope, session: ReviewSession): string;
