# 通用插件化 AI 助教平台：首批数据交付包 v0.1

整理日期：2026-10-20。范围是实施方案、课程包与候选数据；没有实现 Web 平台，没有运行教学 Agent，也没有完成自适应进化实验。

## 快速查看

- `实施初步方案.pdf` / `实施初步方案.md`：实施路线、接口、排期、验收与限制。
- `reports/质量报告.md`：真实核验结果和待审核事项。
- `reviewer_private/review.csv`：180 条候选审核表，含参考答案；UTF-8 BOM，便于 Excel 打开。
- `reviewer_private/all_candidates.jsonl`：完整主数据，仅供审核与评测管理者。
- `courses/python/`、`courses/ai_literacy/`：两个草稿课包，课程资料与内核分离。
- `sources/manifest.json`、`sources/raw/`：9 份实际下载的公开来源及 SHA-256。
- `sources/evidence_index.json`：11 个可定位证据片段，不是教师批准的教学总结。
- `adapters/`：与旧 DatasetCandidate 形状兼容的 DEV 适配器；未启动或接入 Harness。

## 访问边界

完整包、catalog.py、主数据、审核表与封存测试属于构建/审核环境，绝不能整体挂到教学 Agent 或优化器的文件工具。

| 使用者 | 可加载目录 | 不应加载 |
| --- | --- | --- |
| 学生教学运行时 | `courses/`、`public/learning_inputs.jsonl` | 主数据、评分参考、封存测试、构建脚本 |
| 教学评分服务 | 学习参考与授权评分工具 | 无关学生和课程数据 |
| 改进开发器 | `optimizer_allowed/dev_cases.jsonl`、课程证据 | 验证/测试答案、全量 catalog |
| 验证/评测控制器 | 按阶段读取验证或封存测试 | 将参考答案拼入被测 Agent 上下文 |

`runtime_bundle.zip` 只含课包、学生练习输入和来源告知；`optimizer_dev_bundle.zip` 只含开发案例与课包。完整压缩包是审核交付物，不能当学生部署包。目录划分只是导出约束，真正访问控制必须由后续部署落实。

## 数据含义

60 条学生练习：Python 30、AI 通识 30。120 条平台评测：Python 40、AI 通识 40、通用平台行为 40；开发 60、验证 30、最终测试 30。每个评测家族包含正常对照和异常案例，最多三轮交互，本包实际为单轮固定脚本。

所有学习者均为合成身份。65 条记录的固定程序输出已核验；不表示其中开放解释量规已获教师认可。5 条 MBPP 参考代码没有在宿主运行，保留待隔离执行状态。180 条均未由教师审核。

`fixture_only` 是预设工具条件，不是一次真实工具调用。允许动作和中文量规是待审核规范，不是某个模型已通过的成绩。来源链接检查也不等于内容已通过语义审核。

## 重建与复核

在本目录运行，数据脚本仅依赖 Python 标准库（已在 Python 3.12.14 核验）：

```powershell
python scripts/collect_sources.py
python scripts/build_dataset.py --pilot
python scripts/validate_dataset.py --pilot
python scripts/build_dataset.py
python scripts/validate_dataset.py
python scripts/test_acceptance.py
node adapters/test_adapter.mjs
python scripts/build_docs.py
python scripts/package_delivery.py
```

首次采集需要访问列明的公开站点；已下载时使用缓存，不重新下载。`--refresh` 会更新快照，应使用新数据版本。PDF 生成额外需要 reportlab 和可用中文字体，JSONL 构建不依赖它。Node 适配器仅依赖内置模块。

`python scripts/check_reproducibility.py` 在临时目录使用同一来源快照重新构建并核验数据哈希。不要在旧项目里运行本包脚本；本包没有修改旧工作区。

审核表是生成视图，重建会覆盖。人工审核请另存工作副本，填写 reviewer、human_review 和 review_notes；审核结果未自动导入主数据。当前包不声称具备人工审核导入、真实 LLM 生成或发布服务。

## 许可与来源

见 `sources/NOTICE.md`。外部内容保留各自许可、出处与改编记录；本包没有给全部混合来源重新授予统一许可。MBPP 公共题可能已被模型见过，其通过率不能作为未见任务泛化证据。封存测试的“未见”仅指未用于本项目配置选择。
