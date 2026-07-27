import { requireText } from './_shared.js';

export function buildDefaultKnowledgeSpaceDto({ userId } = {}) {
  const normalizedUserId = requireText(
    userId,
    'KNOWLEDGE_SPACE_USER_REQUIRED',
    'Knowledge space userId is required'
  );

  return {
    id: `space-${normalizedUserId}`,
    userId: normalizedUserId,
    name: 'Default Space',
    description: 'Primary knowledge space'
  };
}
