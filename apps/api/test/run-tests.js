import { storageConfigTests } from './storage.config.test.js';
import { noteDomainTests } from './note.domain.test.js';
import { noteServiceTests } from './note-service.test.js';
import { folderServiceTests } from './folder-service.test.js';
import { tagServiceTests } from './tag-service.test.js';
import { knowledgeSpaceServiceTests } from './knowledge-space-service.test.js';
import { searchServiceTests } from './search-service.test.js';
import { noteRepositoryTests } from './note-repository.test.js';
import { noteDtoTests } from './note-dto.test.js';
import { markdownPreviewTests } from './markdown-preview.test.js';
import { fileDataStoreTests } from './file-data-store.test.js';
import { localAttachmentStoreTests } from './local-attachment-store.test.js';
import { folderDtoTests } from './folder-dto.test.js';
import { folderRepositoryTests } from './folder-repository.test.js';
import { tagDtoTests } from './tag-dto.test.js';
import { tagRepositoryTests } from './tag-repository.test.js';
import { knowledgePointServiceTests } from './knowledge-point-service.test.js';
import { knowledgePointHttpTests } from './knowledge-point-http.test.js';
import { knowledgeSpaceDtoTests } from './knowledge-space-dto.test.js';
import { knowledgeSpaceRepositoryTests } from './knowledge-space-repository.test.js';
import { knowledgeModuleTests } from './knowledge-module.test.js';
import { knowledgeHttpTests } from './knowledge-http.test.js';
import { appFactoryTests } from './app-factory.test.js';
import { serverRouteTests } from './server-routes.test.js';

const tests = [
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
  ...knowledgePointServiceTests,
  ...knowledgeSpaceDtoTests,
  ...knowledgeSpaceRepositoryTests,
  ...noteServiceTests,
  ...folderServiceTests,
  ...tagServiceTests,
  ...knowledgeSpaceServiceTests,
  ...searchServiceTests,
  ...knowledgeModuleTests,
  ...knowledgeHttpTests,
  ...knowledgePointHttpTests,
  ...appFactoryTests,
  ...serverRouteTests
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
