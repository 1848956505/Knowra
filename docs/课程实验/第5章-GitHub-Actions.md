# 第五章：GitHub Actions 自动化单元测试

实验使用公开仓库 <https://github.com/weidong-qi/Knowra>，在现有 CI 中增加独立的 Python 示例任务。

## 文件与运行方法

- `calculator.py`：实现 `add` 和 `multiply`。
- `test_calculator.py`：两个测试函数，覆盖实验要求的四条断言，以及零、负数与小数。
- `requirements.txt`：固定测试依赖 pytest 的版本。
- `.github/workflows/ci.yml`：`python-tests` 作业依次检出代码、设置 Python 3.11、安装依赖、运行测试。

本机安装 Python 后，从仓库根目录运行：

```bash
python3 -m venv .venv
# macOS / Linux
source .venv/bin/activate
# Windows PowerShell 使用 .venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
python -m pytest -v test_calculator.py
```

成功时显示 `test_add PASSED`、`test_multiply PASSED` 和 `2 passed`；断言不成立时 pytest 返回非零退出码，GitHub Actions 作业相应失败。

## 云端验证与提交

工作流沿用仓库现有触发条件：向 `main` 推送、发起 Pull Request 或手动运行；仅修改原有忽略路径时不触发完整 CI。本实验的根目录 Python 文件不在忽略范围内。

在仓库 Actions 中打开 `CI`，确认 `Python 3.11 · 单元测试` 的日志包含 `2 passed`，并等待工作流整体成功后，在头歌提交仓库链接。

头歌模板要求的 GitHub 用户名为 `weidong-qi`。如评测必须提供 PAT，需由本人在头歌页面填写；不要把令牌放进 Git、文档、截图或聊天。
