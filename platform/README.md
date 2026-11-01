> 当前版本 v0.9：详见 [运行说明](../output/pilot-v0.9/README.md) 与 [验收报告](../output/pilot-v0.9/验收报告.md)。从源码根目录使用 `platform/start-v09.ps1`，试点端口3811，沿用独立试点数据目录。默认离线，`-RealModel` 使用 LongCat；累计调用和费用默认不限。新增小知、小行平台帮助插件。以下 v0.4—v0.7 内容仅作历史追溯。

# 知行 · 通用插件化 AI 助教平台 v0.4

本地可运行原型，基于《实施初步方案》继续实现。采用 Node.js 24 内置 HTTP / SQLite 和原生浏览器界面，无需安装 npm 依赖。课程和规则以数据包加载，旧 DS-H 和旧数据集工作区没有修改。

## 启动与体验

在本目录运行：

```powershell
.\start.ps1
```

或使用已安装的 Node.js 24：

```powershell
node src/server.mjs
```

访问 **http://127.0.0.1:3810**。学生、教师、管理员均为本地演示账户。服务只绑定回环地址；本原型没有正式学校身份认证，勿作为公网生产服务。默认不调用付费模型。

本机已发现的 Harness 构建位于 `D:\项目\deepseek-harness`。其他机器设置 `HARNESS_ROOT` 指向兼容的 0.2.1-alpha.1 构建目录。借用其原生 Agent Loop、工具注册和 Session，不复制或修改上游执行循环。

若没有 DS-H，可使用 `start.ps1 -LocalRules`，或在页面选择“本地规则直连”。DS-H 失败会报错，不会悄悄伪装成成功调用。

## 已实现

- 学生：跨课程切换、带出处的资料导读、按知识点选题与组卷、答案和解释分别提交、提示、作答反馈、针对性补练、学情与历史。
- 教师：查看课程包、导入第三课程、查看参考与量规、记录通过/退回及审核理由、学情统计。退回题不再参与新练习分配。
- 管理：开发/验证规则评测、失败定向开发变式、候选提出、独立验证、发布门禁、版本回退、经验状态和操作审计。
- 数据：SQLite 持久化；课程/学习者隔离；事件幂等；乐观版本检查；服务端提示计数；同一题不重复累计独立正确证据。
- DS-H：三个工具 `retrieve_evidence`、`generate_task`、`verify_submission` 已通过真实 headless/profile/tool/session 调用链，默认模型适配器为明确标识的离线脚本。
- 最终测试：需确认冻结，只返回汇总；第一次开启后关闭该数据版本的候选选择与发布。同版本重复请求返回缓存，不再开放明细给优化器。

## 能力边界

默认问答是带证据的课程卡片导读，不是通用自然语言推理。选题来自现有题库，不宣称已实现自由生成新题。Python 输出采用预先核验的参考匹配；中文解释采用可查看规则作初筛，开放语义仍待教师复核。学生与外部代码不会在宿主执行。

定向构建目前提供列表、默认参数、返回值三类有限受信程序模板，由开发区失败决定选择。构建后用固定的自建代码运行结果对照另外编写的参考输出；参数只来自有界整数，绝不执行学生或模型提供的代码。正常和异常案例成对生成，保留父家族归属，做内容指纹去重并写入 SQLite；独立新家族数仍记为 0。若受信程序核验不可用则保留拒绝原因，并降级为明确标注的指令变式。它不是完整 AutoBencher 方法复现，不能据此声称泛化提高。

当前候选的独立验证未获得严格提升，因此正确地被拒绝，未自动产生“有效经验”。发布/回退成功路径另有明确标记为状态夹具的单元测试，不冒充实测教学进化成果。

尚未完成真实学生试用、正式教师审定、隔离代码评测服务、完整自适应任务搜索、严格匹配预算的 A/B/C 学习收益实验和生产并发验证。API、服务端记录及页面中均区分规则检查与真实模型能力。

## LongCat 真实模型与教学试点

教师与管理员新增“资料与试点”：支持 PDF/DOCX/Markdown/TXT/HTML 解析、课程内 BM25、带定位引用、独立合成学员预览、课程评测和待人工审核包。详见 [v0.4 使用与验证说明](v0.4使用与验证说明.md)。

真实模型改为 LongCat-2.0，使用官方 Responses 接口和平台自己的 DS-H 适配插件。运行 `test-longcat.ps1 -PromptForKey` 可在本机安全输入密钥并执行固定场景；默认网页服务保持离线。每操作最多 3 次模型请求，总计最多 30 次、费用预算 5 元，输出最多 800 tokens，失败计数且无自动重试。账本 `var/longcat-budget.sqlite` 重启后保留。

只有显式设置 `TUTOR_ENABLE_REAL_MODEL=1`、`TUTOR_PROVIDER=longcat`、`TUTOR_MODEL_ID=LongCat-2.0`、`LONGCAT_API_KEY` 才会在服务中开启真实模型；不回退到其他供应商。模型收到本轮问题与授权工具结果，不提供封存参考和后台审核文件。模型建议、客观核验和待人工审核状态分别记录。

## 三种课程接入方式

教师与管理员侧栏新增“课程接入中心”，支持模板开课、院系 CSV/JSON 批量接入、插件安装与跨课绑定。新增课程统一先进入草稿，经过题目审核和课程发布后向学生开放。详细步骤、API、样例和能力边界见 [课程接入使用说明](课程接入使用说明.md)。

内置理论、客观练习、数值计算三类模板；批量预检逐行报告，整批事务写入。数值容差插件已经接入真实作答评阅流程，保留解释矛盾和提示依赖判断。学校身份、选课和正式教师权限仍待接入。

## 完整课包接入

教师端“课程管理”上传 `examples/course-pack.json` 即可接入第三课，不修改内核。课包包含：

1. `manifest`：课程标识/版本、知识点、目标和所需能力。
2. `cards.concepts`：资料导读、词语别名、解释初筛支持/矛盾短语；外部导入只做字面匹配，不加载正则或可执行代码。
3. `evidence`：原文出处、定位、文本、知识点及许可。
4. `items`：练习题、`exact/open/external_code` 评阅方式、参考与评分量规。

新导入结果、课程与教学班元数据、插件安装及发布状态保存在 SQLite，重启时重新装配；历史 `var/course-packs/` 保持兼容读取。题目编号不能冲突；课程依赖缺失时拒绝导入。导入后在“课程接入中心”审核发布，导入不等于教师审定。

## 主要 API

| 用途 | 接口 |
| --- | --- |
| 演示会话 | `POST /api/demo-login`，`GET /api/me` |
| 课程、证据问答 | `GET /api/courses`，`POST /api/ask` |
| 练习、提示、作答 | `POST /api/practice`，`/api/hint`，`/api/submit` |
| 学情与历史 | `GET /api/state?course=...`，`/api/history?course=...` |
| 教师审核与导入 | `GET /api/teacher/items`，`POST /api/teacher/review`，`/api/teacher/import` |
| 评测与开发变式 | `POST /api/evaluations`，`POST /api/adaptive` |
| 候选与版本 | `POST /api/candidates`，`/api/candidates/:id/validate`，`/publish`，`/api/rollback` |

提交需携带服务端分配的 `assignment_id`、唯一 `event_id` 与 `expected_version`。相同事件重复请求返回原结果；不同内容重用事件或旧版本写入返回 409。学生无法读取教师参考、评测或版本接口。

## 验证与数据访问

```powershell
node tests/platform.test.mjs
node tests/onboarding.test.mjs
node scripts/harness-smoke.mjs
```

第三条启动官方 headless 子进程，强制离线模式，不调用付费 API，同时核验数值插件经 DS-H 参与作答反馈。实际结果在 `reports/harness-smoke.json`。受限运行环境如禁止子进程，会明确报错；正常本地终端可独立启动服务。

服务启动只读取 bootstrap 中的课程和学习数据；评测模块在教师请求时才加载指定分区。学生浏览器只接收输入白名单及自己的作答反馈。`var/` 包含演示学习记录、会话与受控运行日志，不纳入源码压缩包。不要把它挂入学生 Agent 的文件工具。

上游来源：[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)。数据和许可见 `../output/bootstrap-v0.1/sources/NOTICE.md`。本次没有修改初始数据、正式答案或封存测试。
