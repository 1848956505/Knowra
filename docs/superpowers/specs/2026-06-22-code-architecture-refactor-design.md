# Code Architecture Refactor Design

## 背景

本项目已经形成了前后端 monorepo 结构：

- `apps/api`：Node.js HTTP API，知识库模块已有 DDD 风格的 `domain / application / infrastructure / http` 目录。
- `apps/web`：Vanilla JS Web 工作台，当前主界面由 `src/main.js` 提供 HTML shell，`src/client.js` 负责主要交互。
- `docs/开发规范.md` 与 `docs/前端开发规范.md` 明确要求分层、单一职责、统一响应、样式 token 化、组件复用和独立滚动。

当前最大问题不是功能不可用，而是核心文件承担职责过多，后续继续叠功能会显著增加回归风险。

## 重构目标

1. 降低核心业务文件体量：超过 250 行的普通业务源文件必须自查职责，超过 400 到 500 行且职责混杂的文件优先拆分。
2. 明确前端 `View / State / Service / Controller` 边界，避免 `client.js` 继续扩张。
3. 明确后端 `router / handler / service / repository` 边界，避免 `server.js` 同时承担路由、页面、错误处理和业务转发。
4. 建立统一 API 响应与错误模型，为后续多模块扩展提供稳定接口。
5. 将视觉值逐步收敛到 design tokens，减少硬编码颜色、阴影和间距。
6. 保持现有用户行为不变，以小步迁移和测试保护为主，不做一次性重写。

## 非目标

- 不在本轮将前端改成 React、Next.js 或其他框架。
- 不在本轮切换数据库或启用 Prisma。
- 不重做 UI 视觉设计。
- 不改变现有业务数据结构，除非为统一响应格式增加兼容层。
- 不修改生成产物 `apps/web/lib/editor/milkdown-bundle.*`。

## 行数判定口径

本设计按新版规范重新判定文件体量：

- 普通业务源文件理想不超过 250 行。
- 超过 250 行不是自动违规，但必须检查是否职责过多。
- 超过 400 到 500 行的普通业务源文件，如果混入多种业务职责，一般需要拆分。
- 类型定义聚合、路由配置、迁移、自动生成文件、测试快照、Mock 数据、Schema、图标或常量映射表允许例外。
- 例外文件可以较长，但不得混入业务逻辑。比如路由配置可以长，但不应包含业务判断；Mock 数据可以长，但不应承担运行时状态变更。

因此，本设计不再把“超过 250 行”本身视为违规，而是结合职责混杂程度判断是否需要拆分。

## 当前主要风险点

### 前端

- `apps/web/src/client.js` 超过 5400 行，并且包含全局状态、API 请求、缓存恢复、事件绑定、视图渲染、编辑器控制、知识点、标签、目录树和菜单逻辑。这不是单纯行数问题，而是典型职责混杂，应优先拆分。
- `apps/web/styles/components.css` 超过 2600 行。样式文件不等同于普通业务逻辑文件，但当前存在大量硬编码颜色、阴影和透明色值，且多类组件样式集中在一个文件中，应按 token 与组件域拆分。
- `apps/web/src/main.js` 约 300 行，未达到 400 到 500 行的一般拆分阈值，但同时负责 HTML shell、静态文件服务、API 代理、SSR 初始数据加载和端口管理，属于超过 250 行后的职责自查对象。
- `apps/web/components/knowledge-base-workspace.jsx` 超过 400 行，作为业务组件不在例外列表中，应检查是否能拆出 shell、sidebar、editor、aside 等子组件。
- `apps/web/components` 中已有组件未成为主运行入口，复用体系和实际页面实现割裂。
- 部分动态 HTML 中存在内联样式和硬编码颜色，尤其是标签圆点、导出/打印样式、菜单定位。

### 后端

- `apps/api/src/server.js` 超过 1700 行，保留旧 HTML demo，并手写大量 API 路由分支。路由配置本身可作为例外较长，但该文件混入页面渲染、请求解析、响应拼装、路由匹配和错误处理，因此不符合例外条件。
- 未来拆出的 route 文件可作为“路由配置”例外，但必须只描述路由与 handler 绑定，不写业务逻辑。
- API 成功响应多为 `{ data }`，错误响应多为 `{ error: string }`，与规范推荐的统一响应结构不一致。
- 入口层存在直接访问 `appContext.modules.knowledge.noteService` 的路径，绕过 `http` handler。
- 业务错误以普通 `Error` 抛出，缺少错误码、错误类型和 HTTP 状态映射。
- DTO 当前更多是输入组装和默认值填充，缺少集中、显式的外部输入校验。

## 目标架构

### 前端目标结构

```txt
apps/web/src/
  main.js
  shell/
    render-html.js
    static-server.js
    api-proxy.js
    initial-workspace.js
  app/
    bootstrap.js
    state.js
    elements.js
    render-all.js
  services/
    api-client.js
    knowledge-api.js
    storage-api.js
    workspace-cache.js
  features/
    navigation/
    notes/
    tags/
    knowledge-points/
    editor/
    search/
    context-menu/
  ui/
    menus.js
    dialogs.js
    status.js
  styles/
```

`client.js` 最终应退化为启动入口，只做三件事：创建 state、绑定模块、启动首次渲染。具体功能逻辑由 feature 模块持有。

### 后端目标结构

```txt
apps/api/src/
  server.js
  http/
    router.js
    response.js
    request.js
    errors.js
    route-match.js
  modules/
    knowledge/
      http/
        knowledge-routes.js
        knowledge-handlers.js
      application/
      domain/
      infrastructure/
  infrastructure/
  presentation/
```

`server.js` 最终只负责创建 HTTP server、注入 app context、调用 router、处理兜底错误。所有 API 分支从 `server.js` 移出。

## 分阶段方案

### 阶段 1：建立保护网和边界

- 固定当前测试命令：`npm test`。
- 建立文件体量清单，按“普通业务文件 / 允许例外文件 / 生成文件”分类，作为重构前后对比基线。
- 对超过 250 行的普通业务文件记录自查结论；对超过 400 到 500 行且职责混杂的文件列入拆分队列。
- 不改行为，先新增前端 service/API client 和后端 HTTP response/error 工具。
- 保留兼容：前端仍可读取 `{ data }`，后端可逐步迁移到 `{ success, data }`。

### 阶段 2：前端服务层拆分

- 从 `client.js` 抽出 `fetchJson`、知识库请求、附件请求、缓存读写。
- 调整调用点使用 service 函数，而不是直接拼接 `/api/...`。
- 为 service 增加轻量单元测试，覆盖成功、失败和旧响应兼容。

### 阶段 3：前端 feature 拆分

按风险从低到高拆分：

1. 搜索与筛选。
2. 标签与标签 composer。
3. 知识点侧栏。
4. 目录树与上下文菜单。
5. 编辑器面板和保存流程。

每次拆分只迁移一个功能区域，保持 DOM 结构和 CSS class 不变，减少视觉回归。

### 阶段 4：后端路由瘦身

- 新增统一 `sendSuccess`、`sendError`、`parseJsonBody`。
- 将 storage 路由从 `server.js` 移入独立 route 文件。
- 将 knowledge 路由从 `server.js` 移入 `modules/knowledge/http/knowledge-routes.js`。
- 路由文件允许因配置项较多超过 250 行，但只允许声明 method、path、body 解析策略和 handler 绑定，不允许写业务判断。
- 删除或归档 `server.js` 内旧 HTML demo，避免 API server 混入前端页面代码。
- 修复入口层直连 service 的路径，统一通过 `knowledge-handlers.js`。

### 阶段 5：后端错误与校验统一

- 新增 `AppError`、`ValidationError`、`NotFoundError`、`ConflictError`。
- 服务层抛业务错误，HTTP 层统一转换响应。
- DTO 层明确校验外部输入类型、必填项、数组字段、ID 字段。
- 先从 note、folder、tag 这些核心实体开始，再扩展到 knowledge-point。

### 阶段 6：样式 token 收敛

- 扩展 `tokens.css`，补齐 surface、border、shadow、tag、selection、print 等 token。
- 将 `components.css` 中重复颜色替换为变量。
- 将动态 HTML 中固定颜色移出内联 style；仅保留运行时坐标、运行时 tag color 等真正动态值。
- 打印/导出样式抽为独立模板或 CSS 片段，避免散落在业务函数中。

## 测试策略

- 每个迁移阶段至少运行 `npm test`。
- 前端纯函数迁移后补充或更新 `apps/web/test/*` 中对应测试。
- 后端路由迁移后重点运行 `server-routes.test.js`、`knowledge-http.test.js`、`knowledge-module.test.js`。
- 统一响应迁移时增加兼容测试，确保旧前端读取路径不被破坏。
- 若涉及 UI 渲染结构，优先保持 class 和 DOM 层级不变，再做截图或人工检查。

## 风险与约束

- 当前工作区已有大量未提交改动，后续实施必须避免混入无关文件。
- `client.js` 体量很大，不适合一次性拆完，应按 feature 小步迁移。
- 不能机械按 250 行拆文件；常量映射、Mock 数据、Schema 和路由配置等例外文件应重点检查是否混入业务逻辑。
- API 响应格式变更会影响前端所有请求，必须通过兼容层渐进迁移。
- 样式 token 化容易产生视觉微差，应在行为重构稳定后分批推进。
- `milkdown-bundle.*` 是构建产物，已在 `.gitignore` 中排除，不纳入手写代码质量评估。

## 建议执行顺序

1. 前端 API/service 拆分。
2. 前端搜索、标签、知识点侧栏拆分。
3. 后端 response/error 工具与 route 文件拆分。
4. 后端 DTO 校验与业务错误统一。
5. 前端目录树、菜单、编辑器控制拆分。
6. 样式 token 化和组件复用整理。

这个顺序优先降低最大维护压力，同时避免在响应格式、UI 样式和编辑器逻辑三个高风险点上同时动刀。
