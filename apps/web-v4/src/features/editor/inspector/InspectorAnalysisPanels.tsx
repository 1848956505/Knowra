import { Button } from '../../../components/ui';
import { SparkIcon } from '../../../components/icons/knowra';
import { ExtractionDemoNotice } from '../ExtractionEnvironment';
import type { EditorInspectorProps } from './types';
import type { useInspectorAnalysis } from './useInspectorAnalysis';
import { InspectorSection } from './InspectorSection';
import styles from '../EditorInspector.module.css';

type AnalysisState = ReturnType<typeof useInspectorAnalysis>;

export function InspectorAnalysisIntro({ props, state }: { props: Pick<EditorInspectorProps, 'onExtractWithAssistant' | 'canWrite' | 'knowledgeWriteDisabledReason' | 'onPreviewAnalysisScope'>; state: AnalysisState }) {
  const { extracting, extractError, startExtraction, environment, creating, previewAnalysis, task } = state;
  return <div className={styles.aiPanel}>
        {props.onExtractWithAssistant ? <div className={styles.assistantEntry}>
          <h3>让 AI 助手提炼知识点</h3>
          <p>助手会读取本篇笔记和你标记的重点，提议知识候选。需要先授权读取本篇；候选只是提议，须在知识库逐条审核后才会入库。</p>
          <Button variant="primary" isPending={extracting} isDisabled={!props.canWrite || Boolean(props.knowledgeWriteDisabledReason)} onPress={() => void startExtraction()}>让 AI 提炼知识点</Button>
          {props.knowledgeWriteDisabledReason ? <p>{props.knowledgeWriteDisabledReason}</p> : !props.canWrite ? <p>当前笔记不可写，无法提炼知识点。</p> : null}
          {extractError ? <p role="alert">{extractError}</p> : null}
        </div> : null}
        <span className={styles.aiIcon}><SparkIcon size={26} /></span>
        <h3>整篇分析</h3>
        <ExtractionDemoNotice />
        <p>预览当前笔记的分析范围。</p>
        {!environment.capability.canStart ? <p>知识提炼暂不可用；仍可保存分析范围和手动整理知识。</p> : null}
        {environment.api ? <Button variant="ghost" isDisabled={environment.checking} onPress={environment.recheck}>重新检查提炼能力</Button> : null}
        <Button variant="primary" isPending={creating} isDisabled={!props.canWrite || !props.onPreviewAnalysisScope} onPress={() => void previewAnalysis('all')}>分析整篇</Button>
        <Button variant="ghost" onPress={() => task.setOpen(true)}>查看提炼任务</Button>
      </div>;
}

export function InspectorSavedScopes({ props, state, pendingIds, run }: {
  props: Pick<EditorInspectorProps, 'canWrite' | 'onListAnalysisScopes' | 'onTrashAnalysisScope' | 'onRestoreAnalysisScope'>;
  state: AnalysisState;
  pendingIds: ReadonlySet<string>;
  run(id: string, action: () => Promise<void>): Promise<void>;
}) {
  const { savedScopes, environment, task, setScopeRefresh } = state;
  return props.onListAnalysisScopes ? <InspectorSection icon={<SparkIcon size={18} />} title="已保存分析范围" count={savedScopes.filter(item => !item.deletedAt).length}>
        {savedScopes.length === 0 ? <p className={styles.emptyInline}>暂无已保存的分析范围。</p> : <div className={styles.noteLinks}>{savedScopes.map(scope => <div key={scope.id}>
          <strong>{scope.noteVersions?.map(version => version.title || version.noteId).join('、') || '分析范围'}</strong>
          <span> · {scope.summary?.segmentCount ?? 0} 个片段 · {scope.deletedAt ? '回收站' : '已保存'}</span>
          <Button variant="ghost" isDisabled={!props.canWrite || pendingIds.has(scope.id) || !(scope.deletedAt ? props.onRestoreAnalysisScope : props.onTrashAnalysisScope)} onPress={() => void run(scope.id, async () => {
            const action = scope.deletedAt ? props.onRestoreAnalysisScope : props.onTrashAnalysisScope;
            await action?.(scope.id, { spaceId: scope.spaceId, expectedUpdatedAt: scope.updatedAt ?? scope.createdAt });
            setScopeRefresh(value => value + 1);
          })}>{scope.deletedAt ? '恢复范围' : '移入回收站'}</Button>
          {!scope.deletedAt && environment.capability.canStart ? <Button isDisabled={!props.canWrite || task.pending} onPress={() => task.prepare(scope.id)}>提炼此范围</Button> : null}
        </div>)}</div>}
      </InspectorSection> : null;
}
