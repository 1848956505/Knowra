# Knowra 瑞士编辑网格整合原型

本原型只以以下三份材料为视觉事实来源：

- `../工作台（首页）.png`
- `../资料库.png`
- `../原始稿/knowra-swiss-grid/`

它将原始稿整理为一条连贯的产品路径：

1. 在知识索引中浏览、筛选和搜索资料；
2. 查看选中资料的类型、标签、关联知识与大纲；
3. 打开资料进入多标签编辑工作区；
4. 编辑正文并查看知识边注、反向链接和引用；
5. 新建资料、收起详情面板或返回知识索引。

原型不连接 Knowra 后端，不写入项目数据。

直接查看时可双击同目录下的 `Knowra整合UI原型.html`，不需要启动服务。

## 运行

```bash
npm install --legacy-peer-deps
npm run dev
```

## 构建

```bash
npm run build
```

生成可双击打开的独立 HTML：

```bash
npm run build:standalone
```
