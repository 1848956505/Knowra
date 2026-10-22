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
  Assert<null extends ResolveProvenanceSourceInput['noteVersion'] ? true : false>
];
