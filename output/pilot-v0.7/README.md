# 知行 · 插件化 AI 助教 v0.7

先读[验收报告](验收报告.md)、[对话修复说明](对话问题修复说明.md)及[问答延迟优化](问答延迟优化说明.md)。最新回归108/108；学生问答支持流式预览、最近3轮上下文，课程依据与模型补充区分展示；问候零调用，普通问答一次模型请求，复用DS-H进程。本机地址 http://127.0.0.1:3810/ ，教师 → 插件实验室。

当前四个试点课包均为草稿。三插件已可使用；技术检查不等于教师审核，5条候选已隔离，真实模拟10段行为尚未被规则确认。

## 运行

要求Node.js24+、Python（已有资料解析依赖）、已构建的DS-H，及启动的Docker Desktop Linux引擎。上游DS-H位置用HARNESS_ROOT指定；本机为D:/项目/deepseek-harness。

- 本机已有数据库：在项目根目录执行 `.\platform\start.ps1`。默认离线；真实模式仅在进程环境配置LONGCAT_API_KEY、TUTOR_ENABLE_REAL_MODEL=1、TUTOR_PROVIDER=longcat、TUTOR_MODEL_ID=LongCat-2.0。不要把密钥粘贴到网页或源码。当前运行进程已临时配置，重启后需重新配置。
- 全新工作区：先运行 `node platform/scripts/bootstrap-v07.mjs` 创建草稿与资料，再运行start.ps1。初始化不批准内容、不调用模型。
- 沙箱准备：`node platform/scripts/prepare-sandbox.mjs`，默认复用现有摘要；更新镜像需显式加--refresh并重新验收。
- 离线回归：`node --test platform/tests/*.test.mjs`；容器矩阵：`node platform/scripts/v07-sandbox-matrix.mjs`。
- 重放本轮候选构建：`node platform/scripts/pilot-v07.mjs` 复用主库幂等检查点。真实验收须显式设置TUTOR_V07_REAL_ACCEPTANCE=1；已有完成任务不会再次计费。结果未知的步骤不能普通恢复；重新生成必须是明确的新任务。不要删除预算账本来重置费用。

## 文件

course-packs含Python、AI通识、统计学、多语言编程四课包；datasets含教师/学生分离导出、48条固定场景、轨迹、来源与许可索引；reports含94项检查、21项沙箱矩阵、调用成本与全部请求元数据、审核包、改进与失败记录；sdk含原生插件清单、类型和镜像摘要；screenshots含界面证据。源码压缩包不带密钥、真实学生数据或本机运行库。
