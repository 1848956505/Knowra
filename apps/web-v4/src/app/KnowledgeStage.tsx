import { useAppStore } from '../store/AppStoreProvider';
import { KnowledgeWorkspaceView } from '../features/knowledge/KnowledgeWorkspaceView';
import { Button, LoadingState } from '../components/ui';
import { LOCAL_KNOWLEDGE_WRITE_REASON, workspaceCapabilities } from '../store/workspaceCapabilities';
import { useNavigate } from './router';

export function KnowledgeStage({ pathname, onOpenNote }: { pathname: string; onOpenNote(id: string): void }) {
  const state = useAppStore(value => value);
  const navigate = useNavigate();
  if (state.dataMode === 'loading') return <LoadingState label="正在加载知识库…" />;
  if (state.dataMode !== 'api') return <section><h1>知识库</h1><p role="alert">{state.workspaceError || '暂时无法读取知识库，请连接资料库后重试。'}</p><Button onPress={() => void state.retryWorkspace()}>重试加载</Button></section>;
  const canWrite = state.canWriteWorkspace() && workspaceCapabilities(state.persistenceMode).writeKnowledge;
  return <KnowledgeWorkspaceView
    selectedItemId={new URLSearchParams(pathname.split('?')[1] ?? '').get('item')}
    canWrite={canWrite}
    readOnlyReason={canWrite ? undefined : LOCAL_KNOWLEDGE_WRITE_REASON}
    onSelectItem={id => navigate(`/knowledge?item=${encodeURIComponent(id)}`)}
    onOpenNote={onOpenNote}
    onList={state.listKnowledgeItems}
    onGet={state.getKnowledgeItem}
    onListEvidence={state.listKnowledgeEvidence}
    onCreate={state.createKnowledgeCandidate}
    onUpdate={state.updateKnowledgeItem}
    onConfirm={state.confirmKnowledgeItem}
    onArchive={state.archiveKnowledgeItem}
    onRestore={state.restoreKnowledgeItem}
  />;
}
