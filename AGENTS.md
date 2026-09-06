# Knowra

默认用简体中文沟通；UI、文档和提交说明用中文，代码标识符用英文。文件命名沿用所在目录约定。

## 命令（仓库根目录）

使用 npm workspaces，Node.js >=24、npm >=11。`npm install` 安装依赖。

| 用途 | 命令 |
| --- | --- |
| API + V4 开发 | `npm run dev:all` |
| 单独启动 API / V4 | `npm run dev:api` / `npm run dev:web` |
| V4 构建 / 生产启动 | `npm run build:web` / `npm run start:web` |
| API 测试 | `npm run test:api` |
| V4 测试 | `npm run test:web` |
| V4 类型、架构边界和测试 | `npm run check:web:v4` |
| 共享契约 / V3 回归 / 脚本测试 | `npm run test:web-core` / `npm run test:web:legacy` / `npm run test:scripts` |
| 全部测试 | `npm test` |

按改动选择检查；V4 UI 使用 Vitest，生产服务器使用 node:test；API 使用显式注册的自定义 runner。不要把直接导入 API 测试文件当作执行其测试。交互改动还需验证受影响的页面状态；完整 E2E 入口是 `npm run test:e2e -w @study-accelerator/web-v4`。

## 架构与数据约束

- 唯一可启动前端是 `apps/web-v4`（React、TypeScript、Vite、Zustand、CSS Modules、hash 路由）；`apps/web` 只保留 V3 源码和回归测试。V4 不得导入 V3 模块或资源。
- `react-aria-components` 只由 V4 的 `src/components/ui/` 包装层直接导入。`packages/web-core` 保持框架、CSS 和 DOM 无关；边界由 `scripts/check-v4-boundaries.mjs` 检查。
- API 运行入口使用 `node:http`；路由 → 应用服务 → repository，依赖在 `apps/api/src/app.factory.js` 装配。NestJS 依赖不代表运行中的框架。
- API 成功封装为 `{ data: ... }`，失败为 `{ error: { code, message } }`。保持 DTO 和共享契约一致。
- 默认 `PERSISTENCE_DRIVER=local-json`；PostgreSQL 已实现，需显式选择 `postgres`、提供 `DATABASE_URL` 并应用迁移，失败不得静默回退 JSON。
- `STORAGE_MODE` 默认 `local-first`；上传、导出、临时目录通过 `STORAGE_UPLOADS_DIR` / `STORAGE_EXPORTS_DIR` / `STORAGE_TEMP_DIR` 配置。
- JSON 写入保留原子替换和引用校验；协调永久删除通过 `dataStore.runTransaction()` 提交。PostgreSQL 事务内不做外部文件或网络 IO。
- HTTP 知识空间 owner 由服务端 `KNOWRA_OWNER_ID`（默认 `demo`）决定，不接受客户端覆盖。它不提供身份认证；公开部署在正式登录方案完成前保留 Nginx Basic Auth。
- 保留缓存/加载恢复状态的只读写入保护。`storage/` 是运行数据；附件、导入导出与持久化变更需保持恢复路径。
- 端口由 `scripts/dev-runtime-ports.js` 和 `storage/runtime/dev-ports.json` 发现；不要假定 3000/3001。V4 开发与生产均通过同源 `/api/*` 代理。

## UI 与文档工作流

- 沿用现有组件、tokens 和用户指定的视觉参考；视觉调整默认保持产品行为。新视觉方向可用 `frontend-design`，具体设计资料可用 `ui-ux-pro-max`，UI 规范审查可用 `web-design-guidelines`；只加载任务实际需要的技能。
- 外壳常驻，侧栏、内容区和辅助面板独立滚动；业务弹窗用项目组件。
- 开发约束与版本维护见 [docs/开发规范.md](docs/开发规范.md)；代码定位时按需读 [docs/项目结构导航.md](docs/项目结构导航.md)。结构性变更记入唯一的 [docs/工程变更日志.md](docs/工程变更日志.md)。
- 产品领域变更按需读 [领域冻结稿](docs/知识库与试题模块/Knowra%20知识与考卷系统领域冻结稿.md)；不要用旧版知识点模型或占位导航推断当前业务。
- `CLAUDE.md` 只引用本文件，避免维护两份命令与架构规则。
