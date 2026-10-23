import type { KnowledgeItem } from '../src/modules/knowledge/domain/knowledge-item.ts';
import type { KnowledgeEvidence } from '../src/modules/knowledge/domain/knowledge-evidence.ts';
import type {
  KnowledgeItemRecord,
  KnowledgeItemRepository
} from '../src/modules/knowledge/infrastructure/knowledge-item-repository.ts';
import type {
  KnowledgeEvidenceRecord,
  KnowledgeEvidenceRepository
} from '../src/modules/knowledge/infrastructure/knowledge-evidence-repository.ts';
import type {
  KnowledgeSpaceRecord,
  KnowledgeSpaceRepository
} from '../src/modules/knowledge/infrastructure/knowledge-space-repository.ts';
import type { FolderRecord, FolderRepository } from '../src/modules/knowledge/infrastructure/folder-repository.ts';
import type {
  TagGroupRecord,
  TagGroupRepository
} from '../src/modules/knowledge/infrastructure/tag-group-repository.ts';
import type { TagRecord, TagRepository } from '../src/modules/knowledge/infrastructure/tag-repository.ts';
import type {
  ContentAnnotation,
  ContentAnnotationAnchor,
  ContentAnnotationConstructorInput,
  ContentAnnotationOriginSnapshot
} from '../src/modules/knowledge/domain/content-annotation.ts';
import type {
  AnnotationScopeType,
  AnnotationStructure,
  ContentAnchor,
  IdentityBinding
} from '@study-accelerator/content-anchor';
import type { Note, NoteConstructorInput, NoteDeletionPackage } from '../src/modules/knowledge/domain/note.ts';
import type { ServerResponse } from 'node:http';
import type { ResponseWriter } from '../src/http/response.ts';
import type { Folder } from '../src/modules/knowledge/domain/folder.ts';
import type { KnowledgeSpace } from '../src/modules/knowledge/domain/knowledge-space.ts';
import type { Tag, TagConstructorInput } from '../src/modules/knowledge/domain/tag.ts';
import type { TagGroupConstructorInput } from '../src/modules/knowledge/domain/tag-group.ts';
import type { DefaultTagGroup } from '../src/modules/knowledge/domain/default-tag-groups.ts';

import type { NoteVersion, calculateContentHash } from '../src/modules/knowledge/domain/note-version.ts';
import type {
  VersionSummaryInput,
  versionSummary,
  parseVersionPageQuery
} from '../src/modules/knowledge/domain/note-version-page.ts';
import type { NoteVersionReferenceCandidate } from '../src/modules/knowledge/domain/note-version-references.ts';
import type { NoteVersionRetentionPolicy } from '../src/modules/knowledge/domain/note-version-retention.ts';

import type {
  KnowledgeArtifactProvenance,
  LegacyKnowledgeArtifactProvenance,
  RecordedKnowledgeArtifactProvenance,
  validateKnowledgeArtifactProvenance,
  hashKnowledgeArtifactProvenance,
  ResolvedProvenanceSource
} from '../src/modules/knowledge/domain/knowledge-artifact-provenance-contract.ts';
import type {
  AnalysisScopeAliasVersion,
  resolveAnalysisScopeNoteVersion
} from '../src/modules/knowledge/domain/analysis-scope-version-alias.ts';

import type { KnowledgeArtifactProvenanceRepository } from '../src/modules/knowledge/infrastructure/knowledge-artifact-provenance-repository.ts';
import type {
  Awaitable,
  KnowledgeArtifactProvenanceReader,
  KnowledgeArtifactProvenanceProjection,
  ProvenanceReaderRepositories
} from '../src/modules/knowledge/application/knowledge-artifact-provenance-read.ts';
import type { ResolveProvenanceSourceInput } from '../src/modules/knowledge/domain/knowledge-artifact-provenance-contract.ts';

type Equal<Left, Right> =
  (<Value>() => Value extends Left ? 1 : 2) extends <Value>() => Value extends Right ? 1 : 2 ? true : false;
type Assert<Value extends true> = Value;

// 仅由 strict 类型门编译，不作为运行时测试执行。
export type MigratedContractAssertions = [
  Assert<ServerResponse extends ResponseWriter ? true : false>,
  Assert<Equal<Folder['id'], string>>,
  Assert<Equal<Folder['sortOrder'], number>>,
  Assert<Equal<Folder['createdAt'], string | null>>,
  Assert<Equal<KnowledgeSpace['defaultFlag'], boolean>>,
  Assert<Equal<TagConstructorInput['sortOrder'], unknown>>,
  Assert<Equal<Tag['sortOrder'], number>>,
  Assert<Equal<Tag['color'], string | null>>,
  Assert<Equal<TagGroupConstructorInput['selectionMode'], string | undefined>>,
  Assert<DefaultTagGroup extends TagGroupConstructorInput ? true : false>,
  Assert<Equal<Pick<NoteVersion, 'id'>, Readonly<Pick<NoteVersion, 'id'>>>>,
  Assert<Equal<Parameters<typeof calculateContentHash>[0], unknown>>,
  Assert<Equal<ReturnType<typeof calculateContentHash>, string>>,
  Assert<Equal<VersionSummaryInput['createdAt'], string | Date>>,
  Assert<Equal<ReturnType<typeof versionSummary>['createdAt'], string>>,
  Assert<Equal<ReturnType<typeof parseVersionPageQuery>['limit'], number>>,
  Assert<{ id: string } extends NoteVersionReferenceCandidate ? true : false>,
  Assert<Equal<NoteVersionRetentionPolicy['maxPerNote'], number>>,
  Assert<Equal<Parameters<typeof validateKnowledgeArtifactProvenance>[0], unknown>>,
  Assert<Equal<ReturnType<typeof validateKnowledgeArtifactProvenance>, KnowledgeArtifactProvenance>>,
  Assert<Equal<Parameters<typeof hashKnowledgeArtifactProvenance>[0], unknown>>,
  Assert<Equal<Extract<RecordedKnowledgeArtifactProvenance, { executionMode: 'mock' }>['provider'], 'mock'>>,
  Assert<Equal<Extract<RecordedKnowledgeArtifactProvenance, { executionMode: 'mcp' }>['provider'], 'external-client'>>,
  Assert<Equal<LegacyKnowledgeArtifactProvenance['sources'], undefined>>,
  Assert<Equal<ResolvedProvenanceSource['sourceState'], 'available' | 'stale' | 'unavailable'>>,
  Assert<
    Equal<
      ReturnType<typeof resolveAnalysisScopeNoteVersion<AnalysisScopeAliasVersion & { marker: true }>>,
      AnalysisScopeAliasVersion & { marker: true }
    >
  >,
  Assert<Equal<ReturnType<KnowledgeArtifactProvenanceRepository['create']>, KnowledgeArtifactProvenance>>,
  Assert<Equal<ReturnType<KnowledgeArtifactProvenanceRepository['list']>, KnowledgeArtifactProvenance[]>>,
  Assert<Equal<ReturnType<KnowledgeArtifactProvenanceReader>, Promise<KnowledgeArtifactProvenanceProjection>>>,
  Assert<Equal<Awaitable<string>, string | Promise<string>>>,
  Assert<
    Equal<
      Parameters<ProvenanceReaderRepositories['knowledgeSpaceRepository']['findById']>[0],
      string | null | undefined
    >
  >,
  Assert<null extends ResolveProvenanceSourceInput['noteVersion'] ? true : false>,
  Assert<Equal<NoteConstructorInput['rawMarkdown'], unknown>>,
  Assert<Equal<Note['rawMarkdown'], string>>,
  Assert<Equal<Note['annotationStructure'], AnnotationStructure>>,
  Assert<Equal<Note['deletionPackage'], NoteDeletionPackage | null>>,
  Assert<Equal<Note['updatedAt'], string | null>>,
  Assert<{ id: string; title: string; rawMarkdown: string } extends NoteConstructorInput ? true : false>,
  Assert<Equal<ContentAnnotation['scopeType'], AnnotationScopeType>>,
  Assert<Equal<ContentAnnotation['schemaVersion'], 1 | 2 | 3>>,
  Assert<Equal<ContentAnnotation['identityBinding'], IdentityBinding | null>>,
  Assert<Equal<ContentAnnotation['originSnapshot'], Partial<ContentAnnotationOriginSnapshot> | null>>,
  Assert<ContentAnchor extends ContentAnnotationAnchor ? true : false>,
  Assert<{ format: 'knowra-inline'; markId: string } extends ContentAnnotationAnchor ? true : false>,
  Assert<Equal<ContentAnnotationAnchor['segments'], ContentAnchor['segments'] | undefined>>,
  Assert<Equal<ContentAnnotationConstructorInput['scopeType'], string | undefined>>,
  Assert<{ id: string; userId: string; name: string } extends KnowledgeSpaceRecord ? true : false>,
  Assert<{ id: string; spaceId: string; name: string } extends FolderRecord ? true : false>,
  Assert<{ id: string; spaceId: string; name: string } extends TagRecord ? true : false>,
  Assert<DefaultTagGroup extends TagGroupRecord ? true : false>,
  Assert<Equal<TagGroupRecord['sortOrder'], number | undefined>>,
  Assert<Equal<ReturnType<KnowledgeSpaceRepository['findById']>, KnowledgeSpaceRecord | null>>,
  Assert<Equal<ReturnType<FolderRepository['save']>, FolderRecord>>,
  Assert<Equal<ReturnType<TagGroupRepository['create']>, TagGroupRecord>>,
  Assert<Equal<ReturnType<TagRepository['list']>, TagRecord[]>>,
  Assert<KnowledgeItem extends KnowledgeItemRecord ? true : false>,
  Assert<KnowledgeEvidence extends KnowledgeEvidenceRecord ? true : false>,
  Assert<{ id: string } extends KnowledgeItemRecord ? true : false>,
  Assert<{ id: string; knowledgeItemId: string } extends KnowledgeEvidenceRecord ? true : false>,
  Assert<Equal<{ id: string } extends KnowledgeEvidenceRecord ? true : false, false>>,
  Assert<Equal<KnowledgeItemRecord['updatedAt'], unknown>>,
  Assert<Equal<KnowledgeEvidenceRecord['updatedAt'], unknown>>,
  Assert<Equal<'invalid-status' extends KnowledgeEvidenceRecord['status'] ? true : false, false>>,
  Assert<Equal<'invalid-source' extends KnowledgeEvidenceRecord['sourceType'] ? true : false, false>>,
  Assert<Equal<ReturnType<KnowledgeItemRepository['save']>, KnowledgeItemRecord>>,
  Assert<Equal<ReturnType<KnowledgeEvidenceRepository['markByNoteId']>, KnowledgeEvidenceRecord[]>>,
  Assert<KnowledgeItemRepository extends ProvenanceReaderRepositories['knowledgeItemRepository'] ? true : false>,
  Assert<KnowledgeEvidenceRepository extends ProvenanceReaderRepositories['knowledgeEvidenceRepository'] ? true : false>
];
