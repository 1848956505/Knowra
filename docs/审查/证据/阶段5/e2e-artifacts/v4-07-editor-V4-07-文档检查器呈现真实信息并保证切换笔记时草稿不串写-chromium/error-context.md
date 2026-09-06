# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: v4-07-editor.spec.ts >> V4-07 文档检查器呈现真实信息并保证切换笔记时草稿不串写
- Location: ../../../../apps/web-v4/e2e/v4-07-editor.spec.ts:848:1

# Error details

```
Test timeout of 60000ms exceeded.
```

```
Error: locator.click: Test timeout of 60000ms exceeded.
Call log:
  - waiting for getByRole('complementary', { name: '文档检查器' }).getByRole('link', { name: '关联验收笔记' })

```

# Page snapshot

```yaml
- generic [ref=e3]:
  - link "跳到主内容" [ref=e4] [cursor=pointer]:
    - /url: "#feature-stage"
  - navigation "工作域导航" [ref=e5]:
    - button "知境工作区" [ref=e6] [cursor=pointer]:
      - generic [ref=e7]: 知
    - group "全局操作" [ref=e8]:
      - button "全局搜索" [ref=e9] [cursor=pointer]
      - button "新建笔记" [ref=e14] [cursor=pointer]
    - group "主要工作域" [ref=e18]:
      - button "资料" [ref=e19] [cursor=pointer]
      - button "知识（尚未上线）" [disabled] [ref=e23]
      - button "试题（尚未上线）" [disabled] [ref=e27]
      - button "执行（尚未上线）" [disabled] [ref=e32]
    - group "工具" [ref=e37]:
      - button "通知（尚未上线）" [disabled] [ref=e38]
      - button "设置（尚未上线）" [disabled] [ref=e42]
      - button "组件库" [ref=e47] [cursor=pointer]
      - button "我的（尚未上线）" [disabled] [ref=e54]
  - complementary "笔记上下文导航" [ref=e59]:
    - generic [ref=e60]:
      - generic [ref=e61]:
        - generic [ref=e62]: 笔记
        - button "笔记更多操作" [ref=e63] [cursor=pointer]
        - button "新建笔记" [ref=e68] [cursor=pointer]
      - searchbox "搜索笔记目录" [ref=e75]
      - generic [ref=e76]:
        - region [ref=e77]:
          - heading "快速入口" [level=2] [ref=e78]
          - generic [ref=e79]:
            - button "全部笔记 2" [ref=e80] [cursor=pointer]:
              - generic [ref=e83]: 全部笔记
              - generic [ref=e84]: "2"
            - button "最近编辑 2" [ref=e85] [cursor=pointer]:
              - generic [ref=e89]: 最近编辑
              - generic [ref=e90]: "2"
            - button "收藏 0" [ref=e91] [cursor=pointer]:
              - generic [ref=e95]: 收藏
              - generic [ref=e96]: "0"
            - button "未整理 0" [ref=e97] [cursor=pointer]:
              - generic [ref=e101]: 未整理
              - generic [ref=e102]: "0"
        - region [ref=e103]:
          - generic [ref=e104]:
            - heading "文件夹" [level=2] [ref=e105]
            - button "新建文件夹" [ref=e106] [cursor=pointer]
          - generic [ref=e109]:
            - button "笔记库 1" [ref=e110] [cursor=pointer]:
              - generic [ref=e113]: 笔记库
              - generic [ref=e114]: "1"
            - tree "笔记文件夹" [ref=e115]:
              - treeitem [level=1] [ref=e116]:
                - generic [ref=e117]:
                  - button "展开工作" [ref=e118] [cursor=pointer]
                  - button "工作 2" [ref=e121] [cursor=pointer]:
                    - generic [ref=e124]: 工作
                    - generic [ref=e125]: "2"
        - region [ref=e126]:
          - generic [ref=e127]:
            - heading [level=2] [ref=e128]:
              - button "标签" [expanded] [ref=e129] [cursor=pointer]:
                - generic [ref=e133]: 标签 2
            - generic [ref=e134]:
              - button "新建标签" [ref=e135] [cursor=pointer]
              - button "标签更多操作" [ref=e138] [cursor=pointer]
          - generic "标签筛选" [ref=e144]:
            - button "学习" [ref=e145] [cursor=pointer]
            - button "AI" [ref=e147] [cursor=pointer]
      - button "回收站 0" [ref=e149] [cursor=pointer]:
        - generic [ref=e153]: 回收站
        - generic [ref=e154]: "0"
  - main [ref=e155]:
    - region "笔记编辑页面骨架" [ref=e157]:
      - tablist "打开的笔记" [ref=e158]:
        - generic [ref=e160]:
          - tab "编辑器验收笔记" [selected] [ref=e161] [cursor=pointer]:
            - generic [ref=e162]: "01"
          - button "关闭编辑器验收笔记" [ref=e164] [cursor=pointer]
        - button "查看全部标签页" [ref=e167] [cursor=pointer]
        - button "新建笔记" [ref=e172] [cursor=pointer]
      - generic [ref=e175]:
        - article [ref=e177]:
          - generic [ref=e178]:
            - generic [ref=e179]: NOTE · DRAFT
            - generic [ref=e183]:
              - heading "编辑器验收笔记" [level=1] [ref=e184]:
                - textbox "笔记标题" [ref=e185]: 编辑器验收笔记
              - paragraph [ref=e186]:
                - generic [ref=e187]: draft
                - generic [ref=e188]: 工作
                - generic [ref=e189]: 更新于 08/31
          - toolbar "笔记格式工具栏" [ref=e190]:
            - generic "编辑器菜单" [ref=e191]:
              - button "文件" [ref=e192] [cursor=pointer]
              - button "段落" [ref=e193] [cursor=pointer]
              - button "编辑" [ref=e194] [cursor=pointer]
              - button "格式" [ref=e195] [cursor=pointer]
              - button "视图" [ref=e196] [cursor=pointer]
            - button "一级标题" [ref=e198] [cursor=pointer]:
              - strong [ref=e199]: H1
            - button "二级标题" [ref=e200] [cursor=pointer]:
              - strong [ref=e201]: H2
            - button "三级标题" [ref=e202] [cursor=pointer]:
              - strong [ref=e203]: H3
            - button "加粗" [ref=e205] [cursor=pointer]:
              - strong [ref=e206]: B
            - button "斜体" [ref=e207] [cursor=pointer]:
              - emphasis [ref=e208]: I
            - button "行内代码" [ref=e209] [cursor=pointer]
            - button "无序列表" [ref=e213] [cursor=pointer]
            - button "引用" [ref=e219] [cursor=pointer]
            - button "插入表格" [ref=e222] [cursor=pointer]
            - button "插入图片" [ref=e226] [cursor=pointer]
            - button "收藏当前笔记" [ref=e232] [cursor=pointer]
            - button "打开插入菜单" [ref=e235] [cursor=pointer]
            - button "切换文档检查器" [pressed] [ref=e238] [cursor=pointer]
            - button "更多文档操作（尚未接入）" [disabled] [ref=e241]
          - button "选择要插入的图片" [ref=e246]
          - generic [ref=e248]:
            - generic "笔记正文编辑器" [ref=e249]:
              - textbox "笔记正文" [active] [ref=e252]:
                - paragraph [ref=e253]: 已有正文 仅属于第一篇
                - paragraph [ref=e254]: 验收段落 1
                - paragraph [ref=e255]: 验收段落 2
                - paragraph [ref=e256]: 验收段落 3
                - paragraph [ref=e257]: 验收段落 4
                - paragraph [ref=e258]: 验收段落 5
                - paragraph [ref=e259]: 验收段落 6
                - paragraph [ref=e260]: 验收段落 7
                - paragraph [ref=e261]: 验收段落 8
                - paragraph [ref=e262]: 验收段落 9
                - paragraph [ref=e263]: 验收段落 10
                - paragraph [ref=e264]: 验收段落 11
                - paragraph [ref=e265]: 验收段落 12
                - paragraph [ref=e266]: 验收段落 13
                - paragraph [ref=e267]: 验收段落 14
                - paragraph [ref=e268]: 验收段落 15
                - paragraph [ref=e269]: 验收段落 16
                - paragraph [ref=e270]: 验收段落 17
                - paragraph [ref=e271]: 验收段落 18
                - paragraph [ref=e272]: 验收段落 19
                - paragraph [ref=e273]: 验收段落 20
                - paragraph [ref=e274]: 验收段落 21
                - paragraph [ref=e275]: 验收段落 22
                - paragraph [ref=e276]: 验收段落 23
                - paragraph [ref=e277]: 验收段落 24
                - paragraph [ref=e278]: 验收段落 25
                - paragraph [ref=e279]: 验收段落 26
                - paragraph [ref=e280]: 验收段落 27
                - paragraph [ref=e281]: 验收段落 28
                - paragraph [ref=e282]: 验收段落 29
                - paragraph [ref=e283]: 验收段落 30
                - paragraph [ref=e284]: 验收段落 31
                - paragraph [ref=e285]: 验收段落 32
                - paragraph [ref=e286]: 验收段落 33
                - paragraph [ref=e287]: 验收段落 34
                - paragraph [ref=e288]: 验收段落 35
                - paragraph [ref=e289]: 验收段落 36
                - paragraph [ref=e290]: 验收段落 37
                - paragraph [ref=e291]: 验收段落 38
                - paragraph [ref=e292]: 验收段落 39
                - paragraph [ref=e293]: 验收段落 40
                - paragraph [ref=e294]: 验收段落 41
                - paragraph [ref=e295]: 验收段落 42
                - paragraph [ref=e296]: 验收段落 43
                - paragraph [ref=e297]: 验收段落 44
                - paragraph [ref=e298]: 验收段落 45
                - paragraph [ref=e299]: 验收段落 46
                - paragraph [ref=e300]: 验收段落 47
                - paragraph [ref=e301]: 验收段落 48
                - paragraph [ref=e302]: 验收段落 49
                - paragraph [ref=e303]: 验收段落 50
                - paragraph [ref=e304]: 验收段落 51
                - paragraph [ref=e305]: 验收段落 52
                - paragraph [ref=e306]: 验收段落 53
                - paragraph [ref=e307]: 验收段落 54
                - paragraph [ref=e308]: 验收段落 55
                - paragraph [ref=e309]: 验收段落 56
                - paragraph [ref=e310]: 验收段落 57
                - paragraph [ref=e311]: 验收段落 58
                - paragraph [ref=e312]: 验收段落 59
                - paragraph [ref=e313]: 验收段落 60
                - paragraph [ref=e314]: 验收段落 61
                - paragraph [ref=e315]: 验收段落 62
                - paragraph [ref=e316]: 验收段落 63
                - paragraph [ref=e317]: 验收段落 64
            - button "编辑器右键快捷功能"
        - complementary "文档检查器" [ref=e318]:
          - generic [ref=e319]:
            - heading "文档检查器" [level=2] [ref=e320]
            - button "关闭文档检查器" [ref=e321] [cursor=pointer]
          - generic [ref=e324]:
            - tablist "检查器视图" [ref=e325]:
              - tab "信息" [selected] [ref=e326] [cursor=pointer]
              - tab "大纲" [ref=e327] [cursor=pointer]
              - tab "链接" [ref=e328] [cursor=pointer]
              - tab "标注" [ref=e329] [cursor=pointer]
              - tab "版本" [ref=e330] [cursor=pointer]
              - tab "AI" [ref=e331] [cursor=pointer]
            - tabpanel "信息" [ref=e333]:
              - generic [ref=e334]:
                - generic [ref=e335]:
                  - generic [ref=e336]: KNOWRA NOTE
                  - heading "编辑器验收笔记" [level=3] [ref=e337]
                - generic [ref=e338]:
                  - heading "笔记信息 整理" [level=3] [ref=e339]:
                    - generic [ref=e342]: 笔记信息
                    - button "整理" [ref=e343] [cursor=pointer]
                  - generic [ref=e344]:
                    - generic [ref=e345]:
                      - term [ref=e346]: 类型
                      - definition [ref=e347]: Markdown 文档
                    - generic [ref=e348]:
                      - term [ref=e349]: 状态
                      - definition [ref=e350]:
                        - generic [ref=e351]: 待整理
                    - generic [ref=e353]:
                      - term [ref=e354]: 位置
                      - definition [ref=e355]: 工作
                    - generic [ref=e356]:
                      - term [ref=e357]: 字数
                      - definition [ref=e358]: 385 字
                    - generic [ref=e359]:
                      - term [ref=e360]: 创建
                      - definition [ref=e361]: 2026-08-12 21:14
                    - generic [ref=e362]:
                      - term [ref=e363]: 更新
                      - definition [ref=e364]: 2026-08-31 10:32
                    - generic [ref=e365]:
                      - term [ref=e366]: 阅读
                      - definition [ref=e367]: 约 2 分钟
                - generic [ref=e368]:
                  - heading "标签 2 编辑" [level=3] [ref=e369]:
                    - generic [ref=e373]: 标签
                    - generic [ref=e374]: "2"
                    - button "编辑" [ref=e375] [cursor=pointer]
                  - generic [ref=e376]:
                    - button "查看标签 学习" [ref=e377] [cursor=pointer]:
                      - generic [ref=e378]: 学习
                    - button "查看标签 AI" [ref=e379] [cursor=pointer]:
                      - generic [ref=e380]: AI
                - generic [ref=e381]:
                  - heading "关联笔记 0" [level=3] [ref=e382]:
                    - generic [ref=e386]: 关联笔记
                    - generic [ref=e387]: "0"
                  - paragraph [ref=e388]: 暂无关联笔记
                - generic [ref=e389]:
                  - heading "附件 0" [level=3] [ref=e390]:
                    - generic [ref=e394]: 附件
                    - generic [ref=e395]: "0"
                  - generic [ref=e396]:
                    - button "选择要上传的附件" [ref=e397]
                    - button "上传附件" [ref=e398] [cursor=pointer]
                    - paragraph [ref=e401]: 暂无附件
  - contentinfo "状态栏" [ref=e402]:
    - generic "工作区位置" [ref=e403]:
      - generic [ref=e405]:
        - button "跳转到「笔记库」" [ref=e407] [cursor=pointer]: 笔记库
        - generic [ref=e408]:
          - generic [ref=e409]: /
          - generic [ref=e410]: 编辑器验收笔记
    - generic [ref=e411]:
      - text: 已保存
      - time [ref=e412]: 10:32
    - generic "数据模式：已同步" [ref=e413]: 已同步
    - generic "面板开关" [ref=e416]:
      - button "切换侧栏" [pressed] [ref=e417] [cursor=pointer]
      - button "切换检查器" [pressed] [ref=e420] [cursor=pointer]
      - button "切换专注模式" [ref=e423] [cursor=pointer]
  - status [ref=e427]: 已显示右侧辅助区
```

# Test source

```ts
  782 |   await page.goto('/#/materials/notes/note-1');
  783 | 
  784 |   const editor = page.locator('.ProseMirror');
  785 |   await editor.locator(':scope > p').first().click();
  786 |   await page.keyboard.press('End');
  787 |   const openViewMenu = async () => {
  788 |     await pinEditorToolbar(page);
  789 |     await page.getByRole('button', { name: '视图', exact: true }).click();
  790 |     await expect(page.getByRole('menu', { name: '视图', exact: true })).toBeVisible();
  791 |   };
  792 | 
  793 |   await openViewMenu();
  794 |   for (const label of ['阅读模式', '编辑模式', '专注模式', '隐藏左侧目录区', '显示右侧辅助区', '显示源码编辑器']) {
  795 |     await expect(page.getByRole('menuitem', { name: label, exact: true })).toBeEnabled();
  796 |   }
  797 | 
  798 |   await page.getByRole('menuitem', { name: '阅读模式', exact: true }).click();
  799 |   await expect(editor).toHaveAttribute('contenteditable', 'false');
  800 |   await expect(page.getByRole('textbox', { name: '笔记标题' })).toHaveAttribute('readonly');
  801 |   await editor.evaluate((element) => { element.setAttribute('data-runtime-marker', 'preserved'); });
  802 | 
  803 |   await openViewMenu();
  804 |   await page.getByRole('menuitem', { name: '编辑模式', exact: true }).click();
  805 |   await expect(editor).toHaveAttribute('contenteditable', 'true');
  806 |   await expect(editor).toHaveAttribute('data-runtime-marker', 'preserved');
  807 |   await editor.focus();
  808 |   await page.keyboard.type(' 选区保持');
  809 |   await expect(editor.locator(':scope > p').first()).toHaveText('已有正文 选区保持');
  810 | 
  811 |   await openViewMenu();
  812 |   await page.getByRole('menuitem', { name: '隐藏左侧目录区', exact: true }).click();
  813 |   await expect(page.getByRole('complementary', { name: '笔记上下文导航' })).toHaveCount(0);
  814 |   await openViewMenu();
  815 |   await page.getByRole('menuitem', { name: '显示左侧目录区', exact: true }).click();
  816 |   await expect(page.getByRole('complementary', { name: '笔记上下文导航' })).toBeVisible();
  817 | 
  818 |   await openViewMenu();
  819 |   await page.getByRole('menuitem', { name: '显示右侧辅助区', exact: true }).click();
  820 |   await expect(page.getByRole('complementary', { name: '文档检查器' })).toBeVisible();
  821 |   await openViewMenu();
  822 |   await page.getByRole('menuitem', { name: '隐藏右侧辅助区', exact: true }).click();
  823 |   await expect(page.getByRole('complementary', { name: '文档检查器' })).toBeHidden();
  824 | 
  825 |   await openViewMenu();
  826 |   await page.getByRole('menuitem', { name: '显示源码编辑器', exact: true }).click();
  827 |   const source = page.getByRole('textbox', { name: 'Markdown 源码编辑器' });
  828 |   await expect(source).toBeVisible();
  829 |   await source.fill('# 源码模式验收\n\n正文同步');
  830 |   await expect(editor).toContainText('源码模式验收');
  831 |   await expect.poll(() => savedMarkdown.at(-1) ?? '').toContain('正文同步');
  832 |   await page.getByRole('button', { name: '保存源码' }).click();
  833 | 
  834 |   await openViewMenu();
  835 |   await page.getByRole('menuitem', { name: '隐藏源码编辑器', exact: true }).click();
  836 |   await expect(source).toHaveCount(0);
  837 | 
  838 |   await openViewMenu();
  839 |   await page.getByRole('menuitem', { name: '专注模式', exact: true }).click();
  840 |   await expect(page.getByRole('navigation', { name: '工作域导航' })).toHaveCount(0);
  841 |   await expect(page.getByRole('complementary', { name: '笔记上下文导航' })).toHaveCount(0);
  842 |   await expect(page.getByRole('button', { name: '切换专注模式' })).toHaveAttribute('aria-pressed', 'true');
  843 |   await page.getByRole('button', { name: '切换专注模式' }).click();
  844 |   await expect(page.getByRole('navigation', { name: '工作域导航' })).toBeVisible();
  845 |   await expect(page.getByRole('complementary', { name: '笔记上下文导航' })).toBeVisible();
  846 | });
  847 | 
  848 | test('V4-07 文档检查器呈现真实信息并保证切换笔记时草稿不串写', async ({ page }) => {
  849 |   test.setTimeout(60_000);
  850 |   const savedMarkdown: string[] = [];
  851 |   const savedRequests: Array<{ noteId: string; markdown: string }> = [];
  852 |   await mockEditorWorkspace(page, savedMarkdown, savedRequests);
  853 |   await page.setViewportSize({ width: 1280, height: 760 });
  854 |   await page.goto('/#/materials/notes/note-1');
  855 | 
  856 |   await page.getByRole('button', { name: '切换文档检查器' }).click();
  857 |   const inspector = page.getByRole('complementary', { name: '文档检查器' });
  858 |   await expect(inspector).toBeVisible();
  859 |   const contextSidebar = page.getByRole('complementary', { name: '笔记上下文导航' });
  860 |   await expect.poll(async () => ({
  861 |     inspector: (await inspector.boundingBox())?.width ?? 0,
  862 |     context: (await contextSidebar.boundingBox())?.width ?? 0
  863 |   })).toEqual({ inspector: 224, context: 224 });
  864 |   await expect.poll(async () => ({
  865 |     inspector: await inspector.evaluate((element) => getComputedStyle(element).backgroundColor),
  866 |     header: await inspector.locator('header').evaluate((element) => getComputedStyle(element).backgroundColor)
  867 |   })).toEqual({ inspector: 'rgb(249, 247, 242)', header: 'rgb(249, 247, 242)' });
  868 |   await expect(inspector.getByRole('tablist', { name: '检查器视图' })).toBeVisible();
  869 |   for (const name of ['信息', '大纲', '链接', 'AI']) {
  870 |     await expect(inspector.getByRole('tab', { name, exact: true })).toBeVisible();
  871 |   }
  872 |   await expect(inspector.getByText('Markdown 文档')).toBeVisible();
  873 |   await expect(inspector.getByText('工作')).toBeVisible();
  874 |   await expect(inspector.getByText('待整理')).toBeVisible();
  875 |   await expect(inspector.getByText('学习')).toBeVisible();
  876 |   await expect(inspector.getByText('AI', { exact: true }).last()).toBeVisible();
  877 | 
  878 |   const editor = page.locator('.ProseMirror');
  879 |   await editor.locator(':scope > p').first().click();
  880 |   await page.keyboard.press('End');
  881 |   await page.keyboard.type(' 仅属于第一篇');
> 882 |   await inspector.getByRole('link', { name: '关联验收笔记' }).click();
      |                                                         ^ Error: locator.click: Test timeout of 60000ms exceeded.
  883 | 
  884 |   await expect(page.getByRole('heading', { name: '关联验收笔记', level: 1 })).toBeVisible();
  885 |   await expect(page.locator('.ProseMirror')).toContainText('第二篇正文');
  886 |   await expect.poll(() => savedRequests.some((entry) => (
  887 |     entry.noteId === 'note-1' && entry.markdown.includes('仅属于第一篇')
  888 |   ))).toBe(true);
  889 |   expect(savedRequests.some((entry) => (
  890 |     entry.noteId === 'note-2' && entry.markdown.includes('仅属于第一篇')
  891 |   ))).toBe(false);
  892 | 
  893 |   await page.goto('/#/materials/notes/note-1');
  894 |   const screenshotInspector = page.locator('aside[aria-label="文档检查器"]');
  895 |   if (!await screenshotInspector.isVisible()) {
  896 |     await page.getByRole('button', { name: '切换文档检查器' }).click();
  897 |   }
  898 |   await expect(screenshotInspector).toBeVisible();
  899 |   await page.screenshot({ path: 'e2e/visual-baseline/screenshots/v4-07-editor-inspector-1280.png', fullPage: false });
  900 |   await page.setViewportSize({ width: 390, height: 760 });
  901 |   await expect.poll(async () => (await screenshotInspector.boundingBox())?.width ?? 0).toBeGreaterThanOrEqual(389);
  902 | });
  903 | 
  904 | test('V4-07 大纲保留标题层级并精确跳转到重复标题', async ({ page }) => {
  905 |   const markdown = [
  906 |     '# 重复标题',
  907 |     ...Array.from({ length: 28 }, (_, index) => `前置段落 ${index + 1} ${'填充内容'.repeat(10)}`),
  908 |     '```md',
  909 |     '## 代码块内标题',
  910 |     '```',
  911 |     '## 重复标题',
  912 |     '### 深层标题',
  913 |     '尾部正文'
  914 |   ].join('\n\n');
  915 |   await mockEditorWorkspace(page, [], [], markdown);
  916 |   await page.setViewportSize({ width: 1280, height: 700 });
  917 |   await page.goto('/#/materials/notes/note-1');
  918 |   await expect(page.locator('[data-editor-ready]')).toHaveAttribute('data-editor-ready', 'true');
  919 | 
  920 |   await page.getByRole('button', { name: '切换文档检查器' }).click();
  921 |   const inspector = page.getByRole('complementary', { name: '文档检查器' });
  922 |   await inspector.getByRole('tab', { name: '大纲' }).click();
  923 |   await expect(inspector.getByText('DOCUMENT OUTLINE')).toHaveCount(0);
  924 |   await expect(inspector.getByRole('heading', { name: '本页大纲' })).toHaveCount(0);
  925 |   await expect(inspector.getByRole('button', { name: '跳转到「代码块内标题」，H2' })).toHaveCount(0);
  926 | 
  927 |   await inspector.getByRole('button', { name: '跳转到「重复标题」，H2' }).click();
  928 |   await expect.poll(() => page.locator('.ProseMirror').evaluate((editor) => {
  929 |     const selection = window.getSelection();
  930 |     const anchor = selection?.anchorNode;
  931 |     const element = anchor instanceof Element ? anchor : anchor?.parentElement;
  932 |     const heading = element?.closest('h2');
  933 |     const stage = editor.closest<HTMLElement>('[data-editor-scroll-root]');
  934 |     const headingBox = heading?.getBoundingClientRect();
  935 |     const stageBox = stage?.getBoundingClientRect();
  936 |     return {
  937 |       focused: document.activeElement === editor,
  938 |       text: heading?.textContent ?? '',
  939 |       visible: Boolean(headingBox && stageBox && headingBox.top >= stageBox.top && headingBox.top < stageBox.bottom)
  940 |     };
  941 |   })).toEqual({ focused: true, text: '重复标题', visible: true });
  942 | });
  943 | 
  944 | test('V4-07 Markdown 导入复用后端批量能力并打开首篇笔记', async ({ page }) => {
  945 |   await mockEditorWorkspace(page, []);
  946 |   await page.setViewportSize({ width: 1280, height: 800 });
  947 |   await page.goto('/#/materials/notes/note-1');
  948 |   await expect(page.getByRole('heading', { name: '编辑器验收笔记' })).toBeVisible();
  949 |   await expect(page.locator('.ProseMirror')).toContainText('已有正文');
  950 |   await page.getByRole('toolbar', { name: '笔记格式工具栏' }).evaluate((toolbar) => {
  951 |     const stage = toolbar.closest('article')?.parentElement;
  952 |     if (!stage) return;
  953 |     stage.scrollTop = 500;
  954 |     stage.dispatchEvent(new Event('scroll'));
  955 |   });
  956 |   await page.getByRole('button', { name: '文件', exact: true }).click();
  957 |   await page.getByRole('menuitem', { name: '导入 Markdown' }).click();
  958 | 
  959 |   const dialog = page.getByRole('dialog', { name: '导入 Markdown' });
  960 |   await expect(dialog).toBeVisible();
  961 |   await dialog.getByLabel('拖放 Markdown 文件到这里').setInputFiles([
  962 |     { name: 'first.md', mimeType: 'text/markdown', buffer: Buffer.from('# 导入验收一\n\n正文') },
  963 |     { name: 'second.markdown', mimeType: 'text/markdown', buffer: Buffer.from('# 导入验收二') }
  964 |   ]);
  965 |   await dialog.getByRole('button', { name: '导入 2 篇' }).click();
  966 |   await expect(page.locator('#note-editor-title')).toHaveText('导入验收一');
  967 | });
  968 | 
  969 | async function mockEditorWorkspace(
  970 |   page: Page,
  971 |   savedMarkdown: string[],
  972 |   savedRequests: Array<{ noteId: string; markdown: string }> = [],
  973 |   initialMarkdown?: string
  974 | ): Promise<void> {
  975 |   let sourceMarkdown = initialMarkdown
  976 |     ?? ['已有正文', ...Array.from({ length: 64 }, (_, index) => `验收段落 ${index + 1}`)].join('\n\n');
  977 |   let relatedMarkdown = '第二篇正文';
  978 |   let copiedNote: ReturnType<typeof createNote> | null = null;
  979 |   let importedNotes: ReturnType<typeof createNote>[] = [];
  980 |   await page.route('**/api/knowledge/**', async (route) => {
  981 |     const request = route.request();
  982 |     const url = new URL(request.url());
```