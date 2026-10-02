# AI-03-02C 提炼任务 HTTP 与 Mock 页面闭环

状态：2026-10-02，基于 main `2fb048613bb5e90b10bd322adb93a6a30f46e310` 实施。连接 [02B 持久化任务](AI-03-02B-持久化提炼任务与Mock执行.md) 与 V4 既有范围、候选和来源对照流程；本批仍限隔离合成 Mock 宿主。最终提交审查、实际页面与真实 PostgreSQL 结果将在验收后登记，不能以实现或测试注册代替通过。

## 开放范围

默认工厂仍返回 `knowledgeExtractionTasks: null`。生产能力声明可读取，但不能开始提炼，也不为读取任务记录隐式装配执行器。关闭时已有分析范围、知识候选和来源继续通过核心知识接口保存、阅读、编辑和人工确认；此状态不承诺任务历史可读。

只有受信测试宿主显式注入 `knowledgeExtractionMock` 才有执行能力。没有产品设置、环境变量、URL 或浏览器存储开关。页面持续显示“模拟演示，结果仅用于流程验收”，候选查看也保留演示环境标识。Mock 不调用真实供应商，不读取凭据，不申请或结算人民币预算。

真实 desktop runtime 不装配此执行器、不放开新 jobs POST 白名单；SQLite 验证共享接口与持久层，不能写成桌面产品入口已开放。真实 provider、核价与预算执行链、AI 产物元数据同步及来源保留升级仍是后续切片；AI-03-01/02 和 P3 整体尚未完成。

## HTTP 契约 v1

成功为 `{ data: ... }`，失败为 `{ error: { code, message } }`，均禁止缓存。owner、资料集与 epoch 从当前宿主读取，不接受客户端指定。POST 继续执行写入来源校验并要求 `X-Knowra-AI-Job: 1`；该请求意图头不提供身份认证，也不替代既有宿主访问边界。

| 接口 | 请求与行为 |
| --- | --- |
| `GET /api/ai/capabilities` | 独立场景声明，返回 `contractVersion: 1` 及 `knowledgeExtraction`。默认 `executionMode: unavailable`、`canStart: false`、`canReadJobs: false`；测试宿主明确为 `mock`。不从旧助手配置或凭据状态推断提炼可用。 |
| `POST /api/ai/jobs` | 严格接受 `kind: knowledgeExtraction`、已保存 `scopeId`、稳定 `idempotencyKey`，返回 202 和任务详情。来源正文、客户端结果、模型、授权与 owner 等额外字段拒绝。 |
| `GET /api/ai/jobs` | 必填 `kind=knowledgeExtraction` 与 `spaceId`，默认 20、最多 50 项；可带 `cursor` 或精确 `idempotencyKey` 查找。返回 `items` 和 `nextCursor`。 |
| `GET /api/ai/jobs/:jobId` | 当前 owner/资料集/epoch 内的任务详情。其他类别、历史 epoch 或不属于当前 owner 的空间不可读。 |
| `POST /api/ai/jobs/:jobId/cancel` | 空对象或无正文；返回实际状态。若结果已先原子接纳，则仍是 `succeeded`，不伪称取消成功或撤回候选。 |
| `POST /api/ai/jobs/:jobId/retry` | 仅用户显式重试失败任务；仍核原来源、grant 有效期和四次尝试上限，不发新授权、不延长原 300 秒。 |

无服务时能力接口仍可读，jobs 列表、详情及动作均明确返回 503。HTTP 不暴露 commit、run 或 recover；客户端不能提交模型结果或操纵任务内部记录。

summary 只提供版本、类型、任务/范围/空间 ID、Mock 身份、状态/阶段与时间。detail 另提供 `candidateIds`、固定安全文案 `error` 和服务端计算的 `actions.canCancel/canRetry/retryUnavailableReason`。失败原文、私有描述、完整回执、请求/响应、凭据引用、授权与租约字段不进入 DTO。按钮能力只表示查询时点；实际重试仍在事务中重复核验。

列表始终限制 owner/dataset/epoch/jobKind/space，按 `createdAt DESC, jobId DESC` 稳定分页。游标绑定查询边界；JSON 在内存筛选、排序后截取，PG 与 SQLite 使用参数化 WHERE/ORDER/LIMIT 获取当前页，不将全 owner 读取后 slice 称为数据库分页。列表不为每个项目重建完整来源或读取候选正文。

## 页面与恢复

1. 在笔记检查器的 AI 页“分析整篇”，或从标注进入提炼预览。先用既有保存流程保存当前草稿，核笔记身份及草稿没有在保存中变化，再生成预览；失败保留草稿，不创建任务。
2. 显示实际保存版本的片段、排除和遗漏。手动“保存范围快照”始终是单独动作；Mock 宿主才显示“开始提炼”。能力不写入已有 `AnalysisScope.previewHash`，不改变原快照合同。
3. 开始动作先保存不可变范围，再按另一个稳定任务幂等键启动。保存成功而启动响应丢失时，保留已保存 scope 与原键，先精确查询原任务；不因网络错误自动创建新授权或新任务。
4. 任务面板显示真实状态，关闭只停止本地轮询。重新打开或刷新以 GET 恢复，不自动 POST。切换笔记、空间或资料集后忽略旧请求的迟到结果；不隐式取消原任务。
5. 停止与重试遵循服务器动作能力。未知网络结果显示查询状态；成功后的空候选如实说明。成功仅表示候选已保存，不能表示知识已确认。
6. 查看候选复用知识工作域、来源对照与个人编辑。正式确认仍由用户点击并走原领域门禁；重读任务不会覆盖个人修订。

最小进行中意图只包含范围/空间/任务键等恢复信息，不保存正文、授权或供应商设置。已核对范围与后来编辑的笔记版本分别对待；不会在用户不知情时替换范围后自动开始。

## 宿主边界

隔离 Web 宿主启动只恢复显式注入的服务，恢复不会重新发送。提炼服务未就绪或失败局部关闭，核心知识服务继续工作。关闭顺序为停止 HTTP 接入、等待活动任务收尾、再关闭库和删除合成目录；测试控制仅在 Node 内存中，没有调试 HTTP 入口。

不支持整库替换的测试宿主不冒称已验 desktop 恢复。未来接入桌面必须同时纳入 recover/close、恢复失败回滚重建、切库和退出生命周期、资料集头与会话保护、共享维护门；不得持独占维护门等待需要同一门收尾的 worker。真实执行开放前仍须满足产物同步能力与来源保留门槛。

## 验收证据

本批仅使用隔离临时目录和合成资料。新页面验收借用 `apps/desktop-runtime/test/e2e/knowledge-extraction-workflow.test.mjs` 的 CI 收集入口，实际宿主是 JSON API 与生产 V4；测试路径不代表 desktop 已启用生成。页面通过真实任务 worker 和 02A 接纳，不向浏览器直接注入成功候选。

验收应分别记录：JSON/SQLite 实际 HTTP 与持久层用例、新增真实 PG 执行、固定 clean 提交生产构建、桌面宽度/390px 实际截图与页面结果、独立审查、候选 CI 和精确合并 main CI。生成的 Prisma Client 在本地环境不可用，真实 PG 由具备独立测试库的 CI 执行；本地条件注册不计通过。

待本批验收完成后在这里填入实际结果，公开 CI 链接与最终合并记录以对应 PR 为准。已有 [PR33](https://github.com/1848956505/Knowra/pull/33) 的 02B main `2fb048613bb5e90b10bd322adb93a6a30f46e310`、[CI 37047025849](https://github.com/1848956505/Knowra/actions/runs/37047025849) 成功（API 511、V4 592、runtime 200、Chromium 35、新真实 PG 5），仅证明本批基线，不能替代新增变更验收。
