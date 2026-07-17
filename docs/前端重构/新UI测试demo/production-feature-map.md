# 正式前端功能—新 UI 承载映射

> 本文用于约束 demo 打磨与后续迁移：正式项目已有功能默认保留，只允许调整入口、布局和交互呈现；原始稿新增能力可追加，但不能以此替换既有功能。

## 1. 结论

当前 demo 是“正式前端外壳验证器”，不是第二套业务实现。

- demo 负责验证信息架构、布局容量、关键状态和交互入口；
- 正式迁移继续复用 vanilla JS 控制器、API、Milkdown 编辑器、状态和测试；
- React/Vite 只用于快速设计验证，现阶段不作为正式前端技术迁移目标；
- 后续按 `01 资料库 → 文件夹 → 打开资料 → Milkdown 编辑/保存` 的纵向切片落地。

## 2. 功能映射

| 正式项目能力 | 正式实现位置 | 新 UI 承载位置 | demo 验证状态 | 正式迁移策略 |
| --- | --- | --- | --- | --- |
| 一级模块切换 | `lib/shell/rail-renderers.js` | 默认大编号导航；模块态底部 01～05 | 已覆盖 | 替换 renderer 与样式，保留模块状态 |
| 文件夹/笔记树 | navigation controller + tree renderers | 01 资料库左侧独立滚动目录树 | 已覆盖展开、选中、长标题、空目录 | 复用现有数据和事件；补新样式 |
| 新建/重命名/删除/拖拽/右键 | navigation controllers/events | 文件夹标题操作位、行尾更多菜单 | 已预留入口；新建文件夹可操作 | 正式迁移直接接现有 commands，不在 demo 重写拖拽算法 |
| 全部/最近/收藏/回收站 | navigation visibility/state | 左侧“视图” + 主区页签 | 已覆盖筛选、恢复 | 复用现有 selection 与 visibility 逻辑 |
| 全文与标签筛选 | search controller/renderers | 主区筛选栏和搜索框 | 已覆盖关键词、标签示例 | 正式接入现有 search state、标签计数和结果规则 |
| 资料列表与详情 | navigation + note state | 瑞士编辑网格列表 + 大块打开按钮 + 常开资料信息/标签 + 按需展开资料组 | 已覆盖选中、打开、空结果、长标题 | 用真实 notes/tags/folders 替换 demo seed |
| 新建资料 | note actions | 主标题按钮、顶部“新建”、文件菜单 | 已覆盖创建并打开 | 接现有 create note / folder service |
| 多标签页 | tab controller/workspace | 编辑器顶部文档标签 | 已覆盖打开、切换、关闭、溢出收缩 | 复用 `openNoteTabs`、拖拽和右键菜单 |
| 文件菜单 | editor file menu | 编辑器第二行“文件”菜单 | 已覆盖全部命令入口 | 复用导入、保存、另存、收藏、删除、导出 commands |
| 编辑/段落/格式菜单 | editor menu renderers | 编辑器固定第二行的菜单 + 右侧常用快捷工具 | 已覆盖命令入口 | 继续调用 Milkdown commands；避免复制编辑器行为 |
| 查找与替换 | editor find panel | 编辑器菜单下方临时面板 | 已覆盖开关和字段布局 | 复用现有 find/replace state 与快捷键 |
| 编辑/阅读/专注/源码 | shell view state + editor controller | 文件菜单、底部状态栏 | 已覆盖四种状态切换 | 复用现有 `state.view` 与 source editor |
| 笔记信息/统计 | sidebar info panel | 右侧“信息”页的带图标常开字段表 | 已覆盖标题、路径、字数、时间、收藏 | 接现有 stats 与 folder path helper |
| 标签编辑 | tag controller + note tag composer | 列表标签、详情标签、右侧信息页 | 已预留添加/移除位置 | 复用标签创建、绑定、筛选逻辑 |
| 关联笔记/反向链接 | sidebar local/API side data | 右侧信息页与资料详情 | 已覆盖关系列表 | 复用 internal links 与 side-data API |
| 附件上传、引用、重命名、删除 | sidebar attachment controllers | 右侧信息页“附件”区 | 已覆盖列表和上传入口 | 复用附件 commands、引用保护、右键菜单和 API |
| 正文大纲与折叠 | sidebar outline panel | 右侧 H1/H2/H3 层级大纲、导轨和当前定位 | 已覆盖多级大纲、当前定位与折叠 | 复用标题提取、定位和按笔记折叠状态 |
| 重要内容标注 | annotation controller | 右侧“重点”页 + 正文引用标号 | 已覆盖卡片和定位入口 | 复用 ContentAnnotation API、marker 与定位逻辑 |
| AI 辅助 | sidebar AI tab | 右侧“AI”页 | 已覆盖能力入口 | 后续新增能力；不阻塞第一纵向切片 |
| 保存状态与字数 | status renderers | 底部固定状态栏 | 已覆盖保存提示、字数、模式 | 复用现有 `saveState`、status message 与数据模式 |
| 本地优先加载链路 | workspace loading/cache | 不直接可视，仅在主区标注数据来源 | 不在 demo 重写 | 保留 SSR → cache → API → mock 顺序 |

## 3. demo 必须继续覆盖的压力状态

- 1280×800 与 1440×1024 桌面视口；
- 6 个打开标签、超长资料标题、深层目录和空目录；
- 无资料、无搜索结果、回收站资料和恢复动作；
- 左右侧栏收起、阅读、专注、Markdown 源码；
- 菜单展开、查找替换、右侧四类页签；
- 真实数据量接入后列表滚动、目录独立滚动与状态栏固定。

## 4. 不在 demo 重复实现的部分

以下能力只验证入口与承载空间，正式迁移时复用原项目实现：Milkdown 命令与快捷键、目录/标签页拖拽、右键菜单模型、附件文件操作、Annotation 锚点、API 持久化、SSR/缓存加载、错误恢复与现有测试。
