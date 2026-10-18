export const KNOWRA_MARKS_FORMAT: 1;

export type KnowraMarkAttrs = Record<string, string>;

export interface KnowraInlineMark {
  id: string;
  attrs: KnowraMarkAttrs;
  roles: string[];
  /** `<mark` 开始处 */
  start: number;
  /** 被标记文字的源码区间（可能含嵌套的其他 `<mark>`） */
  contentStart: number;
  contentEnd: number;
  /** `</mark>` 结束处 */
  end: number;
  line: number;
}

export interface KnowraBlockMarker {
  id: string;
  attrs: KnowraMarkAttrs;
  roles: string[];
  exclude: boolean;
  start: number;
  end: number;
  line: number;
  placement: 'lineEnd' | 'lineBefore' | 'inline';
  /** 标记所属块的首行；lineBefore 时为其后第一行，缺失时为 null */
  targetLine: number | null;
  /** 仅 `s=code`：代码块逻辑内容中的区间 */
  code?: { from: number; to: number; text: string | null; resolved: boolean };
}

export type KnowraMarkProblemReason = 'unclosedMark' | 'invalidMarker' | 'codeTargetMissing' | 'codeRangeInvalid' | 'codeCheckMismatch';

export interface KnowraMarkProblem {
  reason: KnowraMarkProblemReason;
  id?: string;
  start: number;
  end: number;
}

export interface KnowraMarks {
  format: 1;
  inline: KnowraInlineMark[];
  blocks: KnowraBlockMarker[];
  problems: KnowraMarkProblem[];
}

export interface KnowraInlineInsertion {
  id: string;
  from: number;
  to: number;
  attrs?: Record<string, string | null | undefined>;
}

export interface KnowraBlockInsertion {
  id: string;
  line: number;
  attrs?: Record<string, string | null | undefined>;
  exclude?: boolean;
  code?: { from: number; to: number };
}

export function knowraCheck(text: string): string;
export function parseKnowraMarks(markdown: unknown): KnowraMarks;
export function stripKnowraMarks(markdown: unknown): string;
export function stripKnowraMarksMapped(markdown: unknown): { markdown: string; toClean(offset: number): number };
export function formatKnowraMarkOpen(id: string, attrs?: Record<string, string | null | undefined>): string;
export function formatKnowraMarker(id: string, attrs?: Record<string, string | null | undefined>, options?: { exclude?: boolean }): string;
/** snap：边界落在转义、行内代码或实体中间时向外吸附，而不是报错。 */
export function insertKnowraMarks(markdown: string, marks?: { inline?: KnowraInlineInsertion[]; blocks?: KnowraBlockInsertion[]; snap?: boolean; onInvalid?: (item: KnowraInlineInsertion | KnowraBlockInsertion, message: string) => void }): string;
