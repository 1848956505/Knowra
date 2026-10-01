import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { hashRecord } from '../../src/modules/ai/record-contract.js';
import { finalizePlan } from '../../src/modules/ai/action-plan.js';
import { validateActionState } from '../../src/modules/ai/action-state.js';

export function noteActionScenarios(withFixture) {
  return [
    { name: 'P2 固定新建、明确确认、首次输入接纳与重复提交/重启唯一结果', run: () => withFixture(async f => {
      const input = { spaceId: f.space.id, requestId: randomUUID(), toolName: 'notes_create', arguments: { title: '合成记录', rawMarkdown: '一次记录' } };
      const first = await f.actions.plan(input), again = await f.actions.plan(input);
      assert.deepEqual(again, first);
      await assert.rejects(f.actions.plan({ ...input, arguments: { ...input.arguments, rawMarkdown: '迟到另输出' } }), { code: 'AI_IDEMPOTENCY_CONFLICT' });
      await assert.rejects(f.actions.apply(first.actionId), { code: 'AI_ACTION_APPROVAL_REQUIRED' });
      await assert.rejects(f.actions.approve(first.actionId, { planHash: 'a'.repeat(64) }), { code: 'AI_ACTION_PLAN_CHANGED' });
      await f.actions.approve(first.actionId, { planHash: first.plan.planHash });
      const [a,b] = await Promise.all([f.actions.apply(first.actionId), f.actions.apply(first.actionId)]);
      assert.equal(a.status, 'applied'); assert.deepEqual(a.receipt,b.receipt);
      await f.restart(); assert.deepEqual((await f.actions.apply(first.actionId)).receipt, a.receipt);
      assert.equal((await f.notes()).length, 1);
      assert.equal((await f.actions.cancel(first.actionId)).cancellation, 'alreadyCommitted');
    }) },
    { name: 'P2 正文/元数据/草稿/取消/过期与恢复 epoch 均阻止迟到写入', run: () => withFixture(async f => {
      const note = await f.create({ title:'并发目标',rawMarkdown:'原文😀' });
      const make = async () => {
        const row = await f.actions.plan({ spaceId:f.space.id,requestId:randomUUID(),toolName:'notes_append',arguments:{noteId:note.id,rawMarkdown:'\n追加'} });
        await f.actions.approve(row.actionId,{planHash:row.plan.planHash}); return row;
      };
      const row = await make(); await f.update(note.id,{title:'并发改名'});
      await assert.rejects(f.actions.apply(row.actionId),{code:'AI_ACTION_CONFLICT'});
      const draft = await make(); await f.actions.draft({noteId:note.id,clientId:'other-tab',dirty:true});
      await assert.rejects(f.actions.apply(draft.actionId),{code:'AI_ACTION_DRAFT_CONFLICT'});
      assert.equal((await f.getNote(note.id)).rawMarkdown,'原文😀');
      await f.actions.draft({noteId:note.id,clientId:'other-tab',dirty:false});
      const cancelled = await make(); await f.actions.cancel(cancelled.actionId);
      await assert.rejects(f.actions.apply(cancelled.actionId),{code:'AI_ACTION_GRANT_REVOKED'});
      const expired = await make(); f.advance(31*60000);
      await assert.rejects(f.actions.apply(expired.actionId),{code:'AI_ACTION_EXPIRED'});
      f.advance(-31*60000); const stale = await make(); await f.rotate();
      await assert.rejects(f.actions.apply(stale.actionId),{code:'AI_DATASET_STALE'});
    }) },
    { name: 'P2 精确局部正文、撤销预览与二次确认，后续编辑不被撤销覆盖', run: () => withFixture(async f => {
      const note = await f.create({title:'局部修改',rawMarkdown:'重复\n重复😀\n保留'});
      const row = await f.actions.plan({spaceId:f.space.id,requestId:randomUUID(),toolName:'notes_propose_patch',arguments:{noteId:note.id,replacements:[{start:3,end:5,quote:'重复',replacement:'第二处'}]}});
      await f.actions.approve(row.actionId,{planHash:row.plan.planHash}); await f.actions.apply(row.actionId);
      assert.equal((await f.getNote(note.id)).rawMarkdown,'重复\n第二处😀\n保留');
      const requestId = randomUUID(), undo = await f.actions.undoPreview(row.actionId,{requestId});
      await assert.rejects(f.actions.apply(undo.actionId),{code:'AI_ACTION_APPROVAL_REQUIRED'});
      await f.actions.approve(undo.actionId,{planHash:undo.plan.planHash}); await f.actions.apply(undo.actionId);
      assert.equal((await f.getNote(note.id)).rawMarkdown,'重复\n重复😀\n保留');
      assert.equal((await f.actions.undoPreview(row.actionId,{requestId})).status,'applied');
      await f.update(note.id,{rawMarkdown:'后续自己的正文'});
      await assert.rejects(f.actions.undoPreview(row.actionId,{requestId:randomUUID()}),{code:'AI_ACTION_CONFLICT'});
    }) },
    { name: 'P2 新建撤销只软删除；小批量后项冲突整体回滚', run: () => withFixture(async f => {
      const row = await f.actions.plan({spaceId:f.space.id,requestId:randomUUID(),toolName:'notes_create',arguments:{title:'撤销新建',rawMarkdown:'保留版本'}});
      await f.actions.approve(row.actionId,{planHash:row.plan.planHash}); await f.actions.apply(row.actionId);
      const undo = await f.actions.undoPreview(row.actionId,{requestId:randomUUID()}); await f.actions.approve(undo.actionId,{planHash:undo.plan.planHash}); await f.actions.apply(undo.actionId);
      assert.equal((await f.getNote(row.plan.items[0].after.id,true)).deleted,true);
      const a=await f.create({title:'原 A',rawMarkdown:'A'}), b=await f.create({title:'原 B',rawMarkdown:'B'});
      const batch=await f.actions.plan({spaceId:f.space.id,requestId:randomUUID(),toolName:'notes_propose_organize',arguments:{changes:[{noteId:a.id,title:'批次重名'},{noteId:b.id,title:'批次重名'}]}});
      await f.actions.approve(batch.actionId,{planHash:batch.plan.planHash}); await assert.rejects(f.actions.apply(batch.actionId));
      assert.equal((await f.getNote(a.id)).title,'原 A'); assert.equal((await f.getNote(b.id)).title,'原 B');
      const receipt=await f.core.get({ownerId:f.ownerId,datasetId:batch.datasetId,operationId:batch.operationId}); assert.equal(receipt,null);
    }) },
    { name: 'P2 响应丢失与私有账本失败通过核心回执对账，不重复追加', run: () => withFixture(async f => {
      const note=await f.create({title:'对账目标',rawMarkdown:'基线'});
      const row=await f.actions.plan({spaceId:f.space.id,requestId:randomUUID(),toolName:'notes_append',arguments:{noteId:note.id,rawMarkdown:'\n一次'}});
      await f.actions.approve(row.actionId,{planHash:row.plan.planHash});
      const originalCommit=f.core.commit, originalWrite=f.actionStore.write; let failFinalize=false;
      f.core.commit=async (...args)=>{const receipt=await originalCommit(...args);failFinalize=true;throw Object.assign(new Error('lost response'),{code:'DELIVERY_LOST'});};
      f.actionStore.write=(operation)=>{if(failFinalize)throw new Error('private ledger failed');return originalWrite(operation);};
      const applied=await f.actions.apply(row.actionId); assert.equal(applied.status,'applied'); assert.equal(applied.reconciliationPending,true);
      f.core.commit=originalCommit; f.actionStore.write=originalWrite;
      assert.equal((await f.actions.get(row.actionId)).status,'applied'); assert.equal((await f.actions.apply(row.actionId)).status,'applied');
      assert.equal((await f.getNote(note.id)).rawMarkdown,'基线\n一次');
    }) },
    { name: 'P2 改名移动标签批量提交及撤销，批准后引用变化阻止提交', run: () => withFixture(async f => {
      const folder=await f.createFolder({name:'合成目录'}),tag=await f.createTag({name:'合成标签'});
      const a=await f.create({title:'元数据 A',rawMarkdown:'正文 A'}),b=await f.create({title:'元数据 B',rawMarkdown:'正文 B'});
      const batch=await f.actions.plan({spaceId:f.space.id,requestId:randomUUID(),toolName:'notes_propose_organize',arguments:{changes:[{noteId:a.id,title:'新 A',folderId:folder.id,tagIds:[tag.id]},{noteId:b.id,folderId:folder.id,tagIds:[tag.id]}]}});
      await f.actions.approve(batch.actionId,{planHash:batch.plan.planHash});await f.actions.apply(batch.actionId);
      assert.equal((await f.getNote(a.id)).title,'新 A');assert.equal((await f.getNote(b.id)).folderId,folder.id);assert.deepEqual((await f.getNote(a.id)).tagIds,[tag.id]);assert.equal((await f.getNote(a.id)).rawMarkdown,'正文 A');
      const undo=await f.actions.undoPreview(batch.actionId,{requestId:randomUUID()});await f.actions.approve(undo.actionId,{planHash:undo.plan.planHash});await f.actions.apply(undo.actionId);
      assert.equal((await f.getNote(a.id)).title,'元数据 A');assert.equal((await f.getNote(b.id)).folderId,null);assert.deepEqual((await f.getNote(a.id)).tagIds,[]);
      const changed=await f.actions.plan({spaceId:f.space.id,requestId:randomUUID(),toolName:'notes_propose_organize',arguments:{changes:[{noteId:a.id,tagIds:[tag.id]}]}});
      await f.actions.approve(changed.actionId,{planHash:changed.plan.planHash});await f.updateTag(tag.id,{name:'引用被修改'});
      await assert.rejects(f.actions.apply(changed.actionId),{code:'AI_ACTION_CONFLICT'});assert.deepEqual((await f.getNote(a.id)).tagIds,[]);
    }) },
    { name: 'P2 取消与提交交错以核心事务回执为准，无半写入', run: () => withFixture(async f => {
      const make=async title=>{const row=await f.actions.plan({spaceId:f.space.id,requestId:randomUUID(),toolName:'notes_create',arguments:{title,rawMarkdown:'合成'}});await f.actions.approve(row.actionId,{planHash:row.plan.planHash});return row;};
      const cancelled=await make('提交前取消'),original=f.core.commit;
      f.core.commit=async(...args)=>{await f.actions.cancel(cancelled.actionId);return original(...args);};
      await assert.rejects(f.actions.apply(cancelled.actionId),{code:'AI_ACTION_GRANT_REVOKED'});assert.equal((await f.notes()).length,0);
      const committed=await make('提交后取消');let cancelResult;
      f.core.commit=async(...args)=>{const receipt=await original(...args);cancelResult=await f.actions.cancel(committed.actionId);return receipt;};
      assert.equal((await f.actions.apply(committed.actionId)).status,'applied');assert.equal(cancelResult.cancellation,'alreadyCommitted');assert.equal((await f.notes()).length,1);
      f.core.commit=original;
    }) },
    { name: 'P2 损坏恢复计划和回执 fail closed，不能改变精确正文工具语义', run: () => withFixture(async f => {
      const note=await f.create({title:'恢复校验',rawMarkdown:'原文'});
      const row=await f.actions.plan({spaceId:f.space.id,requestId:randomUUID(),toolName:'notes_append',arguments:{noteId:note.id,rawMarkdown:'追加'}});
      for (const mutate of [plan=>{plan.items[0].softDelete=true;},plan=>{plan.items[0].after.title='恶意改名';},plan=>{plan.items[0].after.rawMarkdown='无关';},plan=>{plan.items[0].baseline={exists:false};},plan=>{plan.items[0]=null;}]) {
        const state=await f.actionStore.read(), plan=structuredClone(row.plan); mutate(plan); const {planHash,...content}=plan;
        state.actions[0].plan=finalizePlan(content);
        assert.throws(()=>validateActionState(state),{code:'AI_ACTION_STORAGE_INVALID'});
      }
      assert.equal((await f.getNote(note.id)).rawMarkdown,'原文'); assert.equal(hashRecord(row.plan),hashRecord((await f.actions.get(row.actionId)).plan));
    }) }
  ];
}
