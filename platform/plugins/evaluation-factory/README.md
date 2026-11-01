# evaluation_factory 0.1

受信的按课程插件，依赖 retrieve_evidence、generate_task、verify_submission。
DS-H 入口为 index.mjs；generate 与 verify 使用严格 JSON 输出契约。

教师在布局 A 的“课程质量检查”选择课程及来源、创建候选、运行、审核和导出。
管理员在“教学能力”启停插件；教师在课程质量检查页面绑定本课程。
原有三个教学插件保持原有任务类型；评测数据不采用到学生题库。

接口以 /api/teacher/evaluation-datasets 和 /api/teacher/evaluation-experiments 为前缀。
生成及执行使用现有 plugin-jobs；任务编号幂等，取消及显式恢复沿用原队列。
研究快照冻结后不再编辑或审核；应先审核再冻结。待审快照可导出给教师离线复核，下一轮另建数据集。

公开导出仅包含公开交互；evaluator 视图包含参考和轨迹，仅授权教师可读取。
客观失败必须两次重现；开放语义建议保持待教师审核。
本插件不会更新助教策略、检索设置、量规、学生分数或正式学习状态。

来源：AutoBencher https://arxiv.org/html/2407.08351v2 与 https://github.com/XiangLi1999/AutoBencher 。
本项目借鉴目标驱动与反馈选题，不声称实现论文的多模型新颖性指标。
