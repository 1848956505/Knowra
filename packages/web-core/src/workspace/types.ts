export type WorkspaceDataMode = 'loading' | 'api' | 'cache' | 'local';
export type WorkspaceLoadState = 'idle' | 'loading' | 'ready' | 'error';

export interface EntityBase {
  id: string;
  createdAt?: string;
  updatedAt?: string;
  [key: string]: unknown;
}

export interface KnowledgeSpace extends EntityBase {
  name?: string;
  userId?: string;
  description?: string;
}

export interface Folder extends EntityBase {
  name: string;
  spaceId?: string;
  parentId: string | null;
  pathCache?: string;
  children: Folder[];
}

export interface Note extends EntityBase {
  title: string;
  spaceId?: string;
  folderId: string | null;
  tagIds: string[];
  internalLinks: string[];
  rawMarkdown: string;
  plainText?: string;
  contentHash?: string | null;
  status?: string;
  sourceType?: string;
  contentLoaded: boolean;
  favorite: boolean;
  deleted: boolean;
}

export interface NoteVersion extends EntityBase {
  noteId: string;
  content: string;
  contentHash: string;
  createdAt: string;
  createdBy: string;
}

export interface Attachment extends EntityBase {
  noteId: string;
  fileName: string;
  mimeType: string;
  size: number;
  status: string;
  sha256?: string | null;
  verifiedAt?: string | null;
}

export type TagColor = 'neutral' | 'blue' | 'green' | 'orange' | 'red' | 'violet';

export interface Tag extends EntityBase {
  name?: string;
  color?: TagColor;
  spaceId?: string;
  groupId?: string | null;
  code?: string | null;
  isSystem?: boolean;
  sortOrder?: number;
}

export interface TagGroup extends EntityBase {
  spaceId: string;
  code?: string | null;
  name: string;
  selectionMode: 'single' | 'multiple';
  isSystem: boolean;
  sortOrder: number;
}

export interface Annotation extends EntityBase {
  spaceId: string;
  noteId: string;
  noteVersionId: string | null;
  kind: string;
  sourceMode: string;
  quoteText: string;
  headingPath: string[];
  fromPosition: number;
  toPosition: number;
  prefixText: string;
  suffixText: string;
  anchorFingerprint: string;
  noteContentHash: string;
  idempotencyKey: string;
  status: string;
  deletedAt?: string | null;
}

export interface KnowledgeItem extends EntityBase {
  title: string;
  canonicalStatement: string;
  userExplanation: string;
  knowledgeType: string;
  importance: number | null;
  sourceMode: string;
  reviewStatus?: string;
  evidenceStatus?: string;
  sourceHealth?: string;
  evidenceCount?: number;
  objectiveCount?: number;
  confirmedObjectiveCount?: number;
  questionCount?: number;
  noteIds?: string[];
}

export interface LearningObjective extends EntityBase {
  knowledgeItemId: string;
  objective: string;
  actionVerb: string;
  cognitiveLevel: string;
  difficultyHint: string | null;
  reviewStatus?: string;
  reviewNote: string | null;
  order: number;
  questionCount?: number;
  questionIds?: string[];
}

export interface QuestionSource extends EntityBase {
  sourceType: string;
  sourceId: string | null;
  quote: string;
  locator: Record<string, unknown> | null;
  contentHash: string | null;
  status?: string;
  label?: string;
}

export interface Question extends EntityBase {
  stem: string;
  questionType: string;
  options: unknown[] | null;
  referenceAnswer: unknown | null;
  rubric: unknown | null;
  explanation: string;
  difficulty: string | null;
  sourceMode: string;
  reviewStatus?: string;
  version?: number;
  learningObjectiveIds?: string[];
  sources: QuestionSource[];
}

export interface WorkspaceSnapshot {
  spaces: KnowledgeSpace[];
  currentSpaceId: string | null;
  folderTree: Folder[];
  tags: Tag[];
  tagGroups?: TagGroup[];
  allNotes: Note[];
  openFolders: Record<string, boolean>;
  openNoteTabs: string[];
  selectedFolderId: string | null;
  selectedNoteId: string | null;
}

export interface WorkspaceServerData {
  spaces: KnowledgeSpace[];
  currentSpaceId: string | null;
  folderTree: Folder[];
  foldersById: Record<string, Folder>;
  notes: Note[];
  tags: Tag[];
  tagGroups: TagGroup[];
}
