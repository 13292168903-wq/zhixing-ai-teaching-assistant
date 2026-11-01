# 教学插件 SDK v1

三个随平台交付的受信插件使用 DS-H 原生 `apply(ctx)`：`exercise_factory`、`student_simulator`、`teaching_policy`。清单与操作输出契约分别在 `src/plugin-sdk.mjs`、`src/plugin-contracts.mjs`，SDK 不是上传任意 JavaScript 并自动执行的入口。

每项能力必须声明 ID、版本、依赖、配置、操作、DS-H 入口、课程绑定和权限。平台适配器负责认证、任务快照、持久化与审核；DS-H 入口只注册本轮 ticket 授权的工具。模型只能获得该操作构造的数据，不能改写课程、分数、提示计数、数据库或已发布策略。

新增插件步骤：

1. 按已有目录实现 `apply(ctx)`，复用 `harness/ticket-tool.mjs`。
2. 在受信目录 `TRUSTED_PLUGINS` 注册清单，添加严格 JSON Schema 与宿主输出验证。
3. 添加平台执行器，通过 `PluginJobs` 保存每个模型步骤的结果和任务进度。恢复必须复用已完成步骤；结果未知时禁止重复调用。
4. 添加课程绑定和角色限制，保持所有审核默认待审；新增数值/程序评阅能力时由服务器核验。
5. 在隔离数据库测试禁用、依赖、跨课请求、幂等、恢复和审核门禁，再接入页面。

`datasetCandidate()` 将新候选映射到原数据集 Agent 的 Candidate 结构，借鉴其稳定指纹、来源、校验与检查点设计。原工作区只读；教学候选固定 `development_only`，不使用 TaskBench 任务语义或分区，也不读取既有封存参考。

代码执行：`node scripts/prepare-sandbox.mjs` 拉取官方镜像并记录摘要；`CodeSandbox` 用摘要运行，全程不挂载课程目录、密钥或 Docker 套接字。每个测试独立容器。程序只能收到程序本身与该次 stdin；期望输出保留在评测器。

离线生成可重建；真实模型生成保留请求、原始事件和已保存响应，重建时重放检查点，不声称模型逐字确定性。参考一致和测试通过仅为技术检查，开放语义和教学价值仍需教师审核。
