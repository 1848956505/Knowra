import { attachmentCleanupCrashTests } from './attachment-cleanup-crash.test.js';
import { reviewPostgresAcceptanceTests } from './review-postgres-acceptance.test.js';
import { aiNoteActionHttpTests } from './ai-note-action-http.test.js';
import { aiNoteActionAgentTests } from './ai-note-action-agent.test.js';
import { aiNoteActionPostgresTests } from './ai-note-actions-postgres.test.js';
import { aiNoteActionTests } from './ai-note-actions.test.js';
import { attachmentRecoveryTests } from './attachment-recovery.test.js';
import { annotationDynamicPostgresTests } from './annotation-dynamic-postgres.test.js';
import { annotationDynamicTests } from './annotation-dynamic.test.js';
import { knowledgeReviewFlowTests } from './knowledge-review-flow.test.js';
import { knowledgeExtractionContractTests } from './knowledge-extraction-contract.test.js';
import { aiKnowledgeExtractionGatewayTests } from './ai-knowledge-extraction-gateway.test.js';
import { aiKnowledgeExtractionCommitTests } from './ai-knowledge-extraction-commit.test.js';
import { aiKnowledgeExtractionCommitPostgresTests } from './ai-knowledge-extraction-commit-postgres.test.js';
import { aiKnowledgeExtractionTaskTests } from './ai-knowledge-extraction-task.test.js';
import { aiKnowledgeExtractionTaskPostgresTests } from './ai-knowledge-extraction-task-postgres.test.js';
import { storageConfigTests } from './storage.config.test.js';
import { localBusinessTransactionTests } from './local-business-transactions.test.js';
import { noteDomainTests } from './note.domain.test.js';
import { noteServiceTests } from './note-service.test.js';
import { folderServiceTests } from './folder-service.test.js';
import { tagServiceTests } from './tag-service.test.js';
import { tagSystemTests } from './tag-system.test.js';
import { knowledgeSpaceServiceTests } from './knowledge-space-service.test.js';
import { searchServiceTests } from './search-service.test.js';
import { commandSearchHttpTests } from './command-search-http.test.js';
import { commandSearchPostgresTests } from './command-search-postgres.test.js';
import { noteRepositoryTests } from './note-repository.test.js';
import { noteDtoTests } from './note-dto.test.js';
import { markdownPreviewTests } from './markdown-preview.test.js';
import { fileDataStoreTests } from './file-data-store.test.js';
import { localAttachmentStoreTests } from './local-attachment-store.test.js';
import { folderDtoTests } from './folder-dto.test.js';
import { folderRepositoryTests } from './folder-repository.test.js';
import { tagDtoTests } from './tag-dto.test.js';
import { tagRepositoryTests } from './tag-repository.test.js';
import { knowledgeSpaceDtoTests } from './knowledge-space-dto.test.js';
import { knowledgeSpaceRepositoryTests } from './knowledge-space-repository.test.js';
import { knowledgeModuleTests } from './knowledge-module.test.js';
import { knowledgeHttpTests } from './knowledge-http.test.js';
import { appFactoryTests } from './app-factory.test.js';
import { httpRequestTests } from './http-request.test.js';
import { httpOriginTests } from './http-origin.test.js';
import { httpResponseTests } from './http-response.test.js';
import { contentAnnotationServiceTests } from './content-annotation-service.test.js';
import { annotationScopeServiceTests } from './annotation-scope-service.test.js';
import { serverHttpTests } from './server-http.test.js';
import {
  knowledgeBaseSnapshotServiceTests
} from './knowledge-base-snapshot-service.test.js';
import {
  noteDeletionCoordinatorTests
} from './note-deletion-coordinator.test.js';
import { postgresTagGroupMigrationTests } from './postgres-tag-group-migration.test.js';
import { phase1PostgresTests } from './phase1-postgres.test.js';
import { attachmentIntegrityTests } from './attachment-integrity.test.js';
import { assetLifecycleStage0Tests } from './asset-lifecycle-stage0.test.js';
import { assetLifecycleStage1Tests } from './asset-lifecycle-stage1.test.js';
import { assetLifecycleStage2Tests } from './asset-lifecycle-stage2.test.js';
import { assetLifecycleStage3Tests } from './asset-lifecycle-stage3.test.js';
import { phase2KnowledgeDomainTests } from './phase2-knowledge-domain.test.js';
import { phase3AssessmentTests } from './phase3-assessment.test.js';
import { phase31WorkspaceQueryTests } from './phase31-workspace-query.test.js';
import { batch3ConsistencyTests } from './batch3-consistency.test.js';
import { batch5OperationAccessTests } from './batch5-operation-access.test.js';
import { modelSettingsTests } from './model-settings.test.js';
import { aiGatewayTests } from './ai-gateway.test.js';
import { aiRecordRepositoryTests } from './ai-record-repository.test.js';
import { aiPostgresRepositoryTests, aiPostgresBudgetTests } from './ai-postgres-repository.test.js';
import { aiBudgetWorkerTests } from './ai-budget-worker.test.js';
import { aiReadContextTests } from './ai-read-context.test.js';
import { aiAssistantHttpTests } from './ai-assistant-http.test.js';
import { aiPluginIsolationTests } from './ai-plugin-isolation.test.js';
import { aiAccessV2Tests } from './ai-access-v2.test.js';
import { aiConversationV2Tests } from './ai-conversation-v2.test.js';
import { aiAgentR04Tests } from './ai-agent-r04.test.js';
import { aiRetrievalR06Tests } from './ai-retrieval-r06.test.js';
import { aiNotePlanTests } from './ai-note-plan.test.js';
import { coreOperationStoreTests } from './core-operation-store.test.js';
import { coreOperationPostgresTests } from './core-operation-postgres.test.js';
import { aiConversationPostgresTests } from './ai-conversation-postgres.test.js';

import { annotationListPostgresTests } from './annotation-list-postgres.test.js';
import { annotationListTests } from './annotation-list.test.js';

const tests = [
  ...attachmentCleanupCrashTests,
  ...reviewPostgresAcceptanceTests,
  ...aiNoteActionAgentTests,
  ...aiNoteActionHttpTests,
  ...aiNoteActionTests,
  ...aiNoteActionPostgresTests,
  ...coreOperationStoreTests,
  ...coreOperationPostgresTests,
  ...aiNotePlanTests,
  ...attachmentRecoveryTests,
  ...annotationListTests,
  ...annotationListPostgresTests,
  ...knowledgeExtractionContractTests,
  ...aiKnowledgeExtractionGatewayTests,
  ...aiKnowledgeExtractionCommitTests,
  ...aiKnowledgeExtractionCommitPostgresTests,
  ...aiKnowledgeExtractionTaskTests,
  ...aiKnowledgeExtractionTaskPostgresTests,
  ...knowledgeReviewFlowTests,
  ...localBusinessTransactionTests,
  ...storageConfigTests,
  ...noteDomainTests,
  ...noteDtoTests,
  ...markdownPreviewTests,
  ...fileDataStoreTests,
  ...localAttachmentStoreTests,
  ...noteRepositoryTests,
  ...folderDtoTests,
  ...folderRepositoryTests,
  ...tagDtoTests,
  ...tagRepositoryTests,
  ...knowledgeSpaceDtoTests,
  ...knowledgeSpaceRepositoryTests,
  ...noteServiceTests,
  ...folderServiceTests,
  ...tagServiceTests,
  ...tagSystemTests,
  ...knowledgeSpaceServiceTests,
  ...searchServiceTests,
  ...commandSearchHttpTests,
  ...commandSearchPostgresTests,
  ...knowledgeModuleTests,
  ...knowledgeHttpTests,
  ...appFactoryTests,
  ...httpRequestTests,
  ...httpOriginTests,
  ...httpResponseTests,
  ...contentAnnotationServiceTests,
  ...annotationScopeServiceTests,
  ...annotationDynamicTests,
  ...annotationDynamicPostgresTests,
  ...serverHttpTests,
  ...knowledgeBaseSnapshotServiceTests,
  ...noteDeletionCoordinatorTests,
  ...phase1PostgresTests,
  ...postgresTagGroupMigrationTests,
  ...attachmentIntegrityTests,
  ...assetLifecycleStage0Tests,
  ...assetLifecycleStage1Tests,
  ...assetLifecycleStage2Tests,
  ...assetLifecycleStage3Tests,
  ...phase2KnowledgeDomainTests,
  ...phase3AssessmentTests,
  ...phase31WorkspaceQueryTests,
  ...batch3ConsistencyTests,
  ...batch5OperationAccessTests,
  ...modelSettingsTests,
  ...aiGatewayTests,
  ...aiRecordRepositoryTests,
  ...aiPostgresRepositoryTests,
  ...aiPostgresBudgetTests,
  ...aiBudgetWorkerTests,
  ...aiReadContextTests,
  ...aiAssistantHttpTests,
  ...aiPluginIsolationTests,
  ...aiAccessV2Tests,
  ...aiConversationV2Tests,
  ...aiAgentR04Tests,
  ...aiRetrievalR06Tests,
  ...aiConversationPostgresTests,
];

let failed = 0;

for (const testCase of tests) {
  try {
    await testCase.run();
    console.log(`PASS ${testCase.name}`);
  } catch (error) {
    failed += 1;
    console.error(`FAIL ${testCase.name}`);
    console.error(error);
  }
}

if (failed > 0) {
  process.exitCode = 1;
  console.error(`\n${failed} test(s) failed.`);
} else {
  console.log(`\nAll ${tests.length} test(s) passed.`);
}
