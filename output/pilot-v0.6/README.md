# 知行 · 插件化 AI 助教 v0.6

本轮四项计划与实现对照见[实施计划](实施计划.md)，验证结果见[验收报告](验收报告.md)。平台入口：http://127.0.0.1:3810/ ，选择教师工作台。

- **审核与评测 → 逐题修订**：选择试点课和题目，修改题干、提示、解析、要点或数值参数，查看差异、填依据后保存。保存后重新待审；确认当前内容后才由教师审核。历史恢复也需要依据。
- **审核与评测 → 回答证据**：查看15个真实问答/反馈记录；逐条对照断言与来源，核查提示依赖和服务端核验结果。不能把“检索命中”当成语义正确。
- **审核与评测 → 课程评测**：Python、AI通识共80条合成候选；60条开发/验证参考可修订与审核，20条封存参考不显示。当前仅完成结构检查，参考质量尚未人工确认。
- **资料与试点 → 教学预览**：三门草稿课可预览，统计学复用数值插件。网页默认离线；本轮真实验收在临时密钥进程完成。

## 文件

- `course-packs/`：三门当前草稿课包，共52道练习。
- `materials/statistics-guide.md`：新增统计学自编微讲义，来源与许可明确标注。
- `review-package.json`、`review-template.csv`：137条可见待审记录（52题、10份资料、15个回答/反馈、60条开发/验证参考）。CSV用于记录，网页审核按内容指纹写回；不能将空白审核表当成已批准记录。
- `reports/`：80项代码测试、独立数值核验、真实模型结果、结构评测报告；20条封存参考未运行。
- `screenshots/`：主平台与独立浏览器夹具验证截图。
- `sources.json`：10份资料的版本、哈希、来源、许可和待审核状态。

累计调用次数和费用硬限已经取消。实际消耗持续记入本机 `platform/var/longcat-budget.sqlite`，不得删除重置账本。请求超时、上下文限制、权限与输入检查保留。费用是估算，不是服务商账单。

## 重建与启动

需要 Node.js24、Python和既有解析依赖、兼容DS-H构建；源码包不包含运行时和上游DS-H依赖。新机器先按v0.5说明恢复前两门试点和候选，再执行：

```powershell
node platform/scripts/upgrade-v06.mjs
node platform/scripts/record-checks.mjs
node platform/src/server.mjs
```

`upgrade-v06` 幂等启用已有受信数值插件、接入统计学草稿、回填已有真实回答到待审队列（新机器从已保存的真实验收报告导入，明确标记为历史记录，不再次调用API）；迁移前备份在本机 `platform/var/backups`，不进入压缩包。`assemble-v06.mjs` 导出当前审核包和报告。真实验收已完成，无需重复消耗API；重跑必须先显式归档旧报告，密钥只通过环境变量读取。

新接口：`/api/teacher/workbench/items/:id`（GET/POST）、`/review`、`/restore`，`/api/teacher/workbench/concepts/:course/:id`，`/api/teacher/workbench/answers/:id/review`，以及 `/api/teacher/eval-lab`、`/run`、`/cases/:id/review`、`/holdout-approval`、`/freeze`。审核需提供预读的 `expected_digest` 和依据。

独立封存复核接口接受 `independent_reviewer`、`independence_declared:true`、`reference_file_sha256`、`notes`；哈希按文件原始字节的SHA-256计算，只作一致性核对，不能自动证明审核人独立。需线下完成独立复核后由授权教师登记。本轮未提交该声明，封存未运行。

下一阶段优先由教师完成审核，再用合成教学班试运行；校园试点前接入学校身份与选课授权、隔离预览/正式班级，并补充统计学独立评测参考。学习收益需后续有设计的真实试用实验验证。
