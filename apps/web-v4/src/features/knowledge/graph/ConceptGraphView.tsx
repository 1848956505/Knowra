import { useEffect, useMemo, useState, type KeyboardEvent } from 'react';
import { Button } from '../../../components/ui';
import { KnowledgeIcon } from '../../../components/icons/knowra';
import { WorkspacePanel, WorkspacePanelBody, WorkspacePanelFooter, WorkspacePanelHeader } from '../../../components/workspace/WorkspacePanel';
import { PathTrail } from '../../../shell/PathTrail';
import { useNavigate } from '../../../app/router';
import { CONCEPT_GRAPH_SAMPLE, type ConceptGraphData, type GraphItem, type MasteryLevel } from './conceptGraphData';
import {
  KIND_LABELS, MASTERY_LABELS, VERIFICATION_LABELS, conceptEmphasis, conceptStatus, itemPositions, itemsOf,
  neighborIds, relationLabel, relationMidpoint, relationsOf, type GraphFocus
} from './conceptGraphModel';
import styles from './ConceptGraphView.module.css';

const VIEW_WIDTH = 1040;
const VIEW_HEIGHT = 690;
const CONCEPT_RADIUS = 30;
const RING_RADIUS = 36;
const ITEM_SIZE = 24;
const LEVEL_CLASS: Record<MasteryLevel, string> = {
  notAssessed: styles.levelNotAssessed, weak: styles.levelWeak, basic: styles.levelBasic, mastered: styles.levelMastered
};

function activate(event: KeyboardEvent, action: () => void) {
  if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.stopPropagation(); action(); }
}

const shortTitle = (title: string) => (Array.from(title).length > 9 ? `${Array.from(title).slice(0, 8).join('')}…` : title);

export function ConceptGraphView({ data = CONCEPT_GRAPH_SAMPLE }: { data?: ConceptGraphData }) {
  const navigate = useNavigate();
  const [focus, setFocus] = useState<GraphFocus>({ kind: 'none' });
  const focusConceptId = focus.kind === 'concept' ? focus.id : focus.kind === 'item' ? focus.conceptId : null;
  const focusConcept = data.concepts.find(concept => concept.id === focusConceptId) ?? null;
  const focusItem = focus.kind === 'item' ? data.items.find(item => item.id === focus.id) ?? null : null;
  const statuses = useMemo(() => new Map(data.concepts.map(concept => [concept.id, conceptStatus(data, concept.id)])), [data]);
  const expanded = focusConcept ? itemPositions(focusConcept, itemsOf(data, focusConcept.id)) : [];
  const basisItemIds = new Set(data.relations.map(relation => relation.basisItemId).filter(Boolean));

  const selectConcept = (id: string) => setFocus(current => (current.kind === 'concept' && current.id === id ? { kind: 'none' } : { kind: 'concept', id }));
  const selectItem = (item: GraphItem, conceptId: string | null) => setFocus({ kind: 'item', id: item.id, conceptId });
  const clear = () => setFocus({ kind: 'none' });
  const hasFocus = focus.kind !== 'none';
  useEffect(() => {
    if (!hasFocus) return undefined;
    const onKey = (event: globalThis.KeyboardEvent) => { if (event.key === 'Escape') setFocus({ kind: 'none' }); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [hasFocus]);

  return <WorkspacePanel as="main" aria-labelledby="concept-graph-title">
    <WorkspacePanelHeader title="概念图" code="KNOW" titleId="concept-graph-title" icon={<KnowledgeIcon size={13} />}
      breadcrumb={<PathTrail path={[
        { id: 'home', label: '主页', onNavigate: () => navigate('/') },
        { id: 'knowledge', label: '知识库', onNavigate: () => navigate('/knowledge') },
        { id: 'graph', label: '概念图（原型）', current: true }
      ]} variant="top" />}
      breadcrumbTitle="主页 / 知识库 / 概念图（原型）" actionsLabel="概念图操作"
      actions={<Button size="workspace" onPress={() => navigate('/knowledge')}>返回知识列表</Button>} />
    <WorkspacePanelBody className={styles.body}>
      <p className={styles.prototype} role="note">原型：数据是根据《动手学深度学习》第 1–2 章笔记手填的示例，掌握状态也是手填的，不读写知识库。</p>
      <div className={styles.layout}>
        <div className={styles.canvas}>
          <svg viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`} className={styles.svg} role="group" aria-label="概念图">
            <rect width={VIEW_WIDTH} height={VIEW_HEIGHT} className={styles.backdrop} onClick={clear} />
            {data.relations.map(relation => {
              const from = data.concepts.find(concept => concept.id === relation.from);
              const to = data.concepts.find(concept => concept.id === relation.to);
              const mid = relationMidpoint(data, relation);
              if (!from || !to || !mid) return null;
              const active = !focusConceptId || relation.from === focusConceptId || relation.to === focusConceptId;
              const basis = relation.basisItemId ? data.items.find(item => item.id === relation.basisItemId) : undefined;
              return <g key={relation.id} className={active ? styles.edge : `${styles.edge} ${styles.faded}`} data-relation={relation.type}>
                <line x1={from.x} y1={from.y} x2={to.x} y2={to.y} className={relation.type === 'prerequisiteOf' ? styles.edgeDashed : undefined} />
                <text x={mid.x} y={mid.y - (basis ? 18 : 6)} className={styles.edgeLabel} textAnchor="middle">{relationLabel(relation)}</text>
                {basis ? <g role="button" tabIndex={0} aria-label={`关系说明：${basis.title}`} className={styles.edgeItem}
                  onClick={event => { event.stopPropagation(); selectItem(basis, null); }} onKeyDown={event => activate(event, () => selectItem(basis, null))}>
                  <rect x={mid.x - 7} y={mid.y - 7} width={14} height={14} rx={3} className={`${LEVEL_CLASS[basis.mastery]} ${focusItem?.id === basis.id ? styles.selectedItem : ''}`} />
                </g> : null}
              </g>;
            })}
            {data.concepts.map(concept => {
              const status = statuses.get(concept.id)!;
              const emphasis = conceptEmphasis(data, focusConceptId, concept.id);
              const coverage = status.total ? status.assessed / status.total : 0;
              const circumference = 2 * Math.PI * RING_RADIUS;
              return <g key={concept.id} role="button" tabIndex={0} aria-pressed={emphasis === 'focus'}
                aria-label={`${concept.name}，${MASTERY_LABELS[status.level]}，已评估 ${status.assessed}/${status.total}`}
                className={`${styles.concept} ${styles[emphasis]}`} transform={`translate(${concept.x} ${concept.y})`}
                onClick={event => { event.stopPropagation(); selectConcept(concept.id); }} onKeyDown={event => activate(event, () => selectConcept(concept.id))}>
                <circle r={RING_RADIUS} className={styles.ringTrack} />
                {coverage > 0 ? <circle r={RING_RADIUS} className={styles.ring} strokeDasharray={`${circumference * coverage} ${circumference}`} transform="rotate(-90)" /> : null}
                <circle r={CONCEPT_RADIUS} className={`${styles.node} ${LEVEL_CLASS[status.level]}`} />
                <text y={CONCEPT_RADIUS + 26} textAnchor="middle" className={styles.conceptName}>{concept.name}</text>
              </g>;
            })}
            {focusConcept ? <g className={styles.expansion} aria-label={`${focusConcept.name} 的知识条目`} role="group">
              {expanded.map(({ item, x, y }) => <line key={`link-${item.id}`} x1={focusConcept.x} y1={focusConcept.y} x2={x} y2={y} className={styles.itemLink} />)}
              {expanded.map(({ item, x, y }) => <g key={item.id} role="button" tabIndex={0} aria-pressed={focusItem?.id === item.id}
                aria-label={`${item.title}，${KIND_LABELS[item.kind]}，${VERIFICATION_LABELS[item.verification]}，${MASTERY_LABELS[item.mastery]}`}
                className={styles.item} transform={`translate(${x} ${y})`}
                onClick={event => { event.stopPropagation(); selectItem(item, focusConcept.id); }} onKeyDown={event => activate(event, () => selectItem(item, focusConcept.id))}>
                <rect x={-ITEM_SIZE / 2} y={-ITEM_SIZE / 2} width={ITEM_SIZE} height={ITEM_SIZE} rx={4}
                  className={`${LEVEL_CLASS[item.mastery]} ${item.verification !== 'confirmed' ? styles.unconfirmed : ''} ${focusItem?.id === item.id ? styles.selectedItem : ''}`} />
                {item.verification === 'disputed' ? <text y={5} textAnchor="middle" className={styles.disputedMark}>!</text> : null}
                {basisItemIds.has(item.id) ? <circle cx={ITEM_SIZE / 2} cy={-ITEM_SIZE / 2} r={3.5} className={styles.basisDot} /> : null}
                <text y={ITEM_SIZE / 2 + 15} textAnchor="middle" className={styles.itemLabel}>{shortTitle(item.title)}</text>
              </g>)}
            </g> : null}
          </svg>
          <Legend />
        </div>
        <section className={styles.panel} aria-label="详情" aria-live="polite">
          {focusItem ? <ItemDetail data={data} item={focusItem} onSelectConcept={id => setFocus({ kind: 'concept', id })} />
            : focusConcept ? <ConceptDetail data={data} conceptId={focusConcept.id} onSelectItem={item => selectItem(item, focusConcept.id)} onSelectConcept={id => setFocus({ kind: 'concept', id })} />
            : <Intro />}
        </section>
      </div>
    </WorkspacePanelBody>
    <WorkspacePanelFooter><span>{data.concepts.length} 个概念 · {data.items.length} 条知识 · {data.relations.length} 条关系</span><span>点击圆点展开，Esc 收起</span></WorkspacePanelFooter>
  </WorkspacePanel>;
}

function Legend() {
  return <ul className={styles.legend} aria-label="图例">
    {(['notAssessed', 'weak', 'basic', 'mastered'] as MasteryLevel[]).map(level => <li key={level}><span className={`${styles.swatch} ${LEVEL_CLASS[level]}`} />{MASTERY_LABELS[level]}</li>)}
    <li><span className={`${styles.swatch} ${styles.swatchSquare} ${styles.unconfirmed}`} />虚线框：未确认</li>
    <li><span className={styles.ringSample} />外环：已评估比例</li>
  </ul>;
}

function Intro() {
  return <div className={styles.intro}>
    <h2>怎么看这张图</h2>
    <p>圆点是概念，颜色是它的掌握情况。颜色只由已确认、已评估的知识汇总得出；从没测过的概念显示为“未评估”，不会被当成薄弱。</p>
    <p>点击圆点，它会变蓝，下面的知识条目以方块形式展开；相邻概念保持半清晰，其余淡出。</p>
    <p>连线中点的小方块，是一条需要说明的关系，比如“向量是一维张量”。它和概念下的条目是同一份数据。</p>
    <p className={styles.muted}>可以留意：“链式法则”没有任何条目，是先搭好的骨架；“梯度”和“x.grad”同名易混，是两个概念；“点积”下有一条待核查的笔记原话。</p>
  </div>;
}

function ConceptDetail({ data, conceptId, onSelectItem, onSelectConcept }: { data: ConceptGraphData; conceptId: string; onSelectItem(item: GraphItem): void; onSelectConcept(id: string): void }) {
  const concept = data.concepts.find(entry => entry.id === conceptId)!;
  const status = conceptStatus(data, conceptId);
  const items = itemsOf(data, conceptId);
  const neighbors = neighborIds(data, conceptId);
  return <div className={styles.detail}>
    <p className={styles.eyebrow}>概念</p>
    <h2>{concept.name}</h2>
    <p className={styles.sense}>{concept.sense}</p>
    {concept.aliases.length ? <p className={styles.muted}>别名：{concept.aliases.join('、')}</p> : null}
    <p className={styles.statusLine}><span className={`${styles.swatch} ${LEVEL_CLASS[status.level]}`} />{MASTERY_LABELS[status.level]}<span className={styles.muted}>已评估 {status.assessed}/{status.total} 条已确认知识</span></p>
    <h3>知识条目 <span className={styles.count}>{items.length}</span></h3>
    {items.length === 0 ? <p className={styles.muted}>还没有内容。概念可以先于笔记存在，之后再补。</p> : <ul className={styles.itemList}>
      {items.map(item => <li key={item.id}><button type="button" onClick={() => onSelectItem(item)}>
        <span className={`${styles.swatch} ${styles.swatchSquare} ${LEVEL_CLASS[item.mastery]} ${item.verification !== 'confirmed' ? styles.unconfirmed : ''}`} />
        <span className={styles.itemText}><strong>{item.title}</strong><small>{KIND_LABELS[item.kind]} · {VERIFICATION_LABELS[item.verification]} · {MASTERY_LABELS[item.mastery]}</small></span>
      </button></li>)}
    </ul>}
    <h3>相邻概念 <span className={styles.count}>{neighbors.size}</span></h3>
    <ul className={styles.chips}>{relationsOf(data, conceptId).map(relation => {
      const otherId = relation.from === conceptId ? relation.to : relation.from;
      const other = data.concepts.find(entry => entry.id === otherId);
      return other ? <li key={relation.id}><button type="button" onClick={() => onSelectConcept(other.id)}>{relation.from === conceptId ? `${relationLabel(relation)} → ${other.name}` : `${other.name} → ${relationLabel(relation)}`}</button></li> : null;
    })}</ul>
  </div>;
}

function ItemDetail({ data, item, onSelectConcept }: { data: ConceptGraphData; item: GraphItem; onSelectConcept(id: string): void }) {
  const relation = data.relations.find(entry => entry.basisItemId === item.id);
  return <div className={styles.detail}>
    <p className={styles.eyebrow}>{KIND_LABELS[item.kind]}{relation ? ' · 关系说明' : ''}</p>
    <h2>{item.title}</h2>
    <p className={styles.statement}>{item.statement}</p>
    <dl className={styles.facts}>
      <dt>审阅</dt><dd className={item.verification === 'disputed' ? styles.warning : undefined}>{VERIFICATION_LABELS[item.verification]}</dd>
      <dt>掌握</dt><dd><span className={`${styles.swatch} ${styles.swatchSquare} ${LEVEL_CLASS[item.mastery]}`} />{MASTERY_LABELS[item.mastery]}</dd>
      <dt>来源</dt><dd>{item.source ? <>{item.source.note}<blockquote>{item.source.quote}</blockquote></> : <span className={styles.muted}>没有笔记来源</span>}</dd>
    </dl>
    {item.verificationNote ? <p className={item.verification === 'disputed' ? styles.warningNote : styles.note}>{item.verificationNote}</p> : null}
    <h3>涉及概念</h3>
    <ul className={styles.chips}>{item.conceptIds.map(id => {
      const concept = data.concepts.find(entry => entry.id === id);
      return concept ? <li key={id}><button type="button" onClick={() => onSelectConcept(id)}>{concept.name}</button></li> : null;
    })}</ul>
  </div>;
}
