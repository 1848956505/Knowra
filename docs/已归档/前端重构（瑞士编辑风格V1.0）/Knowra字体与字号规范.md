# Knowra 字体与字号规范

## 目标

正式前端只保留三种字体角色，避免页面、组件和编辑器各自选择字体：

1. 笔记标题与正文强调清晰、锋利、适合长文阅读。
2. 按钮、目录、菜单和资料信息保持圆润、亲和且高辨识度。
3. 编号、英文眉题与技术标识保留少量窄体特征，但不进入中文正文。

本规范不引入在线字体请求，优先使用操作系统字体并提供跨平台回退。

## 字体角色

| 角色 | CSS 令牌 | 字体栈 | 使用范围 |
| --- | --- | --- | --- |
| 圆润界面字体 | `--font-ui` | `SF Pro Rounded` → `PingFang SC` → `Hiragino Sans GB` → `Microsoft YaHei UI` → `Noto Sans CJK SC` | 应用壳、按钮、目录、筛选、标签、菜单、资料信息、边栏和编辑器工具 |
| 锋利阅读字体 | `--font-reading` | `Songti SC` → `Source Han Serif SC` → `Noto Serif CJK SC` → `STSong` → `SimSun` | 资料标题、Milkdown 正文、Markdown 预览、正文标题、引用和表格内容 |
| 窄体展示字体 | `--font-display` | `Avenir Next Condensed` → `Arial Narrow` → `--font-ui` | 英文眉题、阅读分钟、编号和少量技术标识 |

代码块、行内代码和源码编辑器继续使用 `--font-mono`，不计入内容与界面的字体角色。

## 字号层级

### 界面字号

| 层级 | 令牌 | 字号 | 主要用途 |
| --- | --- | --- | --- |
| 微型 | `--type-micro` | 11px | 极少量编号、计数和次级状态 |
| 说明 | `--type-caption` | 12px | 英文眉题、时间、辅助说明 |
| 元信息 | `--type-meta` | 13px | 标签、状态、次级资料信息 |
| 控件 | `--type-control` | 14px | 按钮、目录、筛选、菜单和主要信息 |

界面组件不得再新增 10px、12.5px、15px 等中间字号。旧的 `--text-*` 令牌继续保留，但全部映射到以上四档，避免一次性破坏既有组件接口。

### 阅读字号

| 层级 | 令牌 | 字号 | 主要用途 |
| --- | --- | --- | --- |
| 正文 | `--type-reading` | 18px | 编辑正文与 Markdown 预览 |
| 四级标题 | `--type-heading-4` | 20px | H4 |
| 三级标题 | `--type-heading-3` | 22px | H3 |
| 二级标题 | `--type-heading-2` | 28px | H2 |
| 一级标题 | `--type-heading-1` | 36px | H1 |

正文行高统一为 `1.82`。资料标题使用阅读字体，并在 36–48px 之间响应式变化。

## 应用规则

- 资料索引中的笔记名称仍属于界面导航信息，使用 `--font-ui`；只有进入编辑工作区后，资料标题和正文切换为 `--font-reading`。
- 编辑器中的代码块工具栏、表格操作菜单、图片工具栏和预览目录属于界面控件，必须显式恢复 `--font-ui`。
- 正文代码使用 `--font-mono`，不继承阅读字体。
- 英文眉题和数字指标可以使用 `--font-display`，中文句子、按钮和资料信息不得使用窄体字体。
- 正文 H1～H4 默认使用 `--ink` 黑色，不附带分割线；H5/H6 不再作为正式编辑器可创建的标题层级。
- 蓝色标题与底部分割线只保留给未来重点勾画，统一使用 `data-knowra-emphasis='true'` 属性，不得重新设为某一普通标题等级的默认外观。
- 旧 Markdown 中已有的 H5/H6 继续兼容渲染，避免因视觉规范升级破坏存量正文。
- 新组件应优先使用语义字号令牌，不直接写像素值。

## 实现位置

- 字体与字号令牌：`apps/web/styles/components/knowra-theme-tokens.css`
- 字体角色分配：`apps/web/styles/components/knowra-typography.css`
- 编辑器正文与标题：`apps/web/styles/components/knowra-editor.css`
- 样式入口：`apps/web/styles/components/knowra-redesign.css`

## 验证边界

- 字体角色、字号映射和样式入口已加入自动化契约测试。
- `npm run test:web`：118/118 通过。
- 根据当前协作约定，本轮未启动浏览器、未截图；字体观感与平台实际回退结果由用户在本地正式项目中检查。
