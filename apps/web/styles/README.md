# 前端 UI 风格 Demo 导航

`apps/web/styles/` 同时包含主应用样式和离线视觉 demo。主应用只通过
`apps/web/src/styles.css` 加载 `tokens.css` 与 `components.css`；下列主题目录均为
**隔离 demo**，不会被主应用自动加载。

## 主应用样式入口

| 文件 | 职责 |
| --- | --- |
| `tokens.css` | 设计 token：颜色、字体、间距、圆角、阴影、布局尺寸。 |
| `components.css` | 主应用组件样式聚合入口，只维护 `@import` 顺序。 |
| `components/*` | 按 UI 区域拆分的主应用运行时样式模块。 |

## 视觉 Demo

| 主题目录 | Demo 入口 | 说明 |
| --- | --- | --- |
| `晨光纸笺` | `morning-paper-demo.html` | 暖白纸面、墨蓝强调、适合长时间阅读。 |
| `光年玻璃` | `glass-glow-demo.html` | 深色玻璃拟态、适合多模块扩展方向。 |
| `修远水墨` | `ink-mist-demo.html` | 纸白水墨、留白克制、偏东方阅读感。 |
| `学海星图` | `stars-atlas-demo.html` | 深空星图、信息密度较高。 |
| `星穹中枢` | `star-hub-demo.html` | 未来知识中枢、星图控制台、品牌感更强。 |
| `冷核档案` | `cold-core-archive-demo.html` | 未来研究设施、冷白蓝灰、结构感和成熟度更强。 |
| `仙府云笺` | `xianfu-yunjian-demo.html` | 仙侠云笺方向的视觉探索。 |
| `玄青` | `xuanqing-demo.html` | 玄青色系方向的视觉探索。 |
| `银盐档案馆` | `silver-archive-demo.html` | 银盐档案馆方向的视觉探索。 |
| `墨玉书斋` | `ink-jade-study-demo.html` | 墨玉书斋方向的视觉探索；压缩包为该 demo 的归档素材。 |
| `侘寂浮岛` | `wabi-drift-demo.html` | 和纸留白、朱砂淡墨、衬线/无衬线混排；服务长时间阅读 + 多模块扩展。 |
| `苔藓标本室` | `moss-specimen-demo.html` | 植物图鉴风格：标签卡缝合线、三色索引贴纸、田字格、手写体批注、选中态"翻到背面"。 |
| `植物标本馆` | `herbarium-archive-demo.html` | 植物标本馆方向：馆藏编号、标本纸面、深绿书脊、档案索引和知识库笔记工作台。 |
| `玻璃温室` | `glass-conservatory-demo.html` | 玻璃温室方向：晨雾、半透明面板、轻量学习分区、学习状态和个人知识库笔记工作台。 |

## 维护规则

- Demo 目录不得被 `src/styles.css` 或 `components.css` 引入。
- 若某个 demo 被选为主应用方向，先抽取 token 和组件样式，再合入 `tokens.css` 与 `components/*`。
- 未选中的 demo 只作为离线参考保留；如需归档，移动到 `docs/已归档/` 并同步更新本文件。
