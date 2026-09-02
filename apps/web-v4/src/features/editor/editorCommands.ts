export type EditorCommand =
  | 'heading-1'
  | 'heading-2'
  | 'heading-3'
  | 'heading-4'
  | 'paragraph'
  | 'bold'
  | 'italic'
  | 'strikethrough'
  | 'inline-code'
  | 'highlight'
  | 'internal-link'
  | 'bullet-list'
  | 'ordered-list'
  | 'task-list'
  | 'blockquote'
  | 'code-block'
  | 'horizontal-rule'
  | 'table'
  | 'delete-selection'
  | 'indent'
  | 'outdent'
  | 'paragraph-above'
  | 'paragraph-below'
  | 'undo'
  | 'redo';

export type EditorEditAction =
  | 'undo'
  | 'redo'
  | 'cut'
  | 'copy'
  | 'paste'
  | 'find'
  | 'replace'
  | 'repair-document'
  | 'select-all';

export type EditorClipboardAction = Extract<EditorEditAction, 'cut' | 'copy' | 'paste' | 'select-all'>;
export type EditorFindMode = Extract<EditorEditAction, 'find' | 'replace'>;
export type EditorFindDirection = 'next' | 'previous';

export interface EditorEditResult {
  ok: boolean;
  reason?: 'empty-selection' | 'clipboard-empty' | 'clipboard-denied' | 'unsupported';
}

export interface EditorFindResult {
  found: boolean;
  count: number;
  index: number;
  replaced?: number;
}

export interface EditorCommandTarget {
  run(command: EditorCommand): boolean;
  runEdit(action: EditorClipboardAction): Promise<EditorEditResult>;
  find(query: string, currentIndex: number, direction: EditorFindDirection): EditorFindResult;
  replaceCurrent(query: string, replacement: string, currentIndex: number): EditorFindResult;
  replaceAll(query: string, replacement: string): EditorFindResult;
  clearFind(): void;
  navigateToHeading(index: number, behavior?: ScrollBehavior): boolean;
  getAnnotationSelection(): import('./annotationPayloads').AnnotationSelection | null;
  setAnnotations(annotations: import('@study-accelerator/web-core').Annotation[], focusedId?: string | null): void;
  selectAnnotation(annotationId: string): boolean;
  insertImage(url: string, alt: string): boolean;
  insertLink(url: string, label: string): boolean;
  setMarkdown(markdown: string): void;
  replaceMarkdown(markdown: string): boolean;
  focus(): void;
  getMarkdown(): string;
  getHtml(): string;
}

export type EditorFileAction =
  | 'new-note'
  | 'new-folder'
  | 'import-markdown'
  | 'save'
  | 'save-as'
  | 'rename'
  | 'favorite-note'
  | 'delete-note'
  | 'export-markdown'
  | 'export-pdf';
