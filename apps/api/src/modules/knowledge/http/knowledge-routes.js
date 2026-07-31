import { handleFolderRoute } from './folder-routes.js';
import { handleContentAnnotationRoute } from './content-annotation-routes.js';
import { handleNoteRoute } from './note-routes.js';
import { handleSpaceRoute } from './space-routes.js';
import { handleTagRoute } from './tag-routes.js';
import { handleNoteVersionRoute } from './note-version-routes.js';
import { handleKnowledgeItemRoute } from './knowledge-item-routes.js';
import { handleLearningObjectiveRoute } from './learning-objective-routes.js';
import { handleAssessmentRoute } from './assessment-routes.js';
import { handleWorkspaceRoute } from './workspace-routes.js';

const knowledgeRouteHandlers = [
  handleWorkspaceRoute,
  handleAssessmentRoute,
  handleLearningObjectiveRoute,
  handleKnowledgeItemRoute,
  handleNoteVersionRoute,
  handleContentAnnotationRoute,
  handleNoteRoute,
  handleFolderRoute,
  handleTagRoute,
  handleSpaceRoute
];

export async function handleKnowledgeRoute(context) {
  for (const handler of knowledgeRouteHandlers) {
    if (await handler(context)) {
      return true;
    }
  }

  return false;
}
