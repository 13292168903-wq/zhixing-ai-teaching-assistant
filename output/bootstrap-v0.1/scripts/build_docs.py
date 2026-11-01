"""Build the implementation guide, readable quality report and five-page PDF."""
from pathlib import Path
import json
from xml.sax.saxutils import escape
from build_dataset import ROOT, dump

def write(path,text):
    p=ROOT/path;p.parent.mkdir(parents=True,exist_ok=True);p.write_text(text.strip()+'\n',encoding='utf-8')

def main():
    manifest=json.loads((ROOT/'data_manifest.json').read_text(encoding='utf-8'))
    quality=json.loads((ROOT/'reports/quality.json').read_text(encoding='utf-8'))
    sources=json.loads((ROOT/'sources/manifest.json').read_text(encoding='utf-8'))['sources']
    write(Path('README.md'),'''# 通用插件化 AI 助教平台：首批数据交付包 v0.1

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
''')
    notice=['# 来源与许可告知','','以下为实际下载的原始快照，执行原代码与下载资料是不同动作。本包未执行任何 MBPP 原代码。','']
    for source in sources:
        notice += [f"## {source['id']}",f"- 原始地址：{source['url']}",f"- 许可告知：{source['license']}",f"- 文件：{source['path']}",f"- SHA-256：{source.get('sha256','download failed')}",'']
    notice += ['Python 来源归属 Python Software Foundation；许可文本保存在 py_license.html，文档代码另有 0BSD 告知。',
      'Google Developers 文本通常为 CC-BY-4.0、示例代码通常为 Apache-2.0，具体例外以原始页页脚为准。',
      'MBPP 来源：Austin et al., Program Synthesis with Large Language Models (2021), Google Research；数据卡标为 CC-BY-4.0。原始来源字段及测试保留，中文题面是改编；未宣称外部题全部适合课程或完全正确。',
      '自建材料标为 project-authored synthetic；不冒充真实学生数据。公开再分发时应连同对应署名、许可、变更说明与必要来源告知一起提供。',
      'https://creativecommons.org/licenses/by/4.0/','https://www.apache.org/licenses/LICENSE-2.0','https://docs.python.org/3.13/license.html']
    write(Path('sources/NOTICE.md'),'\n'.join(notice))
    pending=[f"# 数据质量报告 v0.1\n\n日期：2026-10-20。以下结果来自本地静态结构检查与固定代码核验，没有真实教学 Agent 运行结果。\n",
      '| 项目 | 实际结果 |','| --- | --- |',f"| 候选总数 | {manifest['candidate_count']} |",'| 学生练习 | Python 30；AI 通识 30 |',
      '| 平台评测 | Python 40；AI 通识 40；通用行为 40 |','| 评测分区 | 开发 60；验证 30；封存测试 30 |',
      f"| 结构/引用/分区错误 | {len(quality['structural_errors'])} |",f"| 固定代码输出核验 | {quality['fixed_code_output_verified_records']} 条记录 / {quality['unique_fixed_code_programs']} 个不同程序 |",
      '| 外部 MBPP | 5 条改编，待隔离执行；未在宿主运行 |','| 开放教学量规 | 全部待人工审核 |','| 教师审核 / 模型调用 | 0 / 0 |',
      f"| 相似度筛查 | {quality['near_duplicate_pairs']} 对；其中 {quality['near_duplicate_review_pairs']} 对同区相似练习待复查 |",'| 跨分区家族 / 代码骨架 / 高相似冲突 | 0 / 0 / 0 |','',
      '## 核验边界','',
      '- 输出核验采用固定的自建代码白名单，和人工预先填写的期望输出比较；拒绝运行不在白名单中的代码。它不是用于任意学生代码的安全沙箱。',
      '- 初始参考程序执行环境 Python 3.12.14；文档固定 3.13 系列，本包只覆盖两者共有的基础语义。',
      '- 通用平台案例仅检查夹具和策略规范的结构，不证明助教能正确执行。AI 通识解释属于来源支持的草稿量规，尚无教师一致性结果。',
      '- 近重复使用字符相似度 0.88 作筛查阈值。正常/异常成对案例保留同一家族；不同家族但同区的相似练习列入 near_duplicates.json，尚未人工裁决。',
      '- 精确来源及原文定位可追溯；程序核验不评估中文解释的教学充分性。未审核、争议或失败项不可进入正式评分标准或已验证经验库。',
      '', '## 待审核工作','',
      '1. 教师审核两个课程包的目标、先修关系、错误边界和补救建议。',
      '2. 全部 180 条记录确认教学适用性；重点看 70 条来源关联的开放判断和 40 条平台规范案例。',
      '3. 在真正隔离的代码服务里复核 5 条 MBPP 参考及测试，并补充边界测试。',
      '4. 复查同区相似对，决定保留、重写或去除；不要把它们按独立难度任务数量宣传。',
      '5. 后续运行教学 Agent 后，才填写失败发现、策略改进、调用成本和真实用户反馈。',
      '', '## 已有独立文件','',
      '- pilot_validation.json：12 条种子检查。','- quality.json：完整机器报告。','- leakage_groups.json：家族和代码骨架分组。',
      '- near_duplicates.json：相似候选与处理状态。','- rejected.jsonl：下载记录缺失等构建拒绝项；空文件表示本轮未出现此类拒绝，不表示人工审核全通过。',
      '- acceptance_tests.txt / adapter_test.txt / reproducibility.json：验收、适配器与重建记录。']
    write(Path('reports/质量报告.md'),'\n'.join(pending))
    write(Path('POLICY.md'),'''# 平台行为规范草稿 POLICY-v0.1

本规范是自建测试的依据，不是已经部署的权限系统。所有条款待教师与平台负责人确认。

1. boundaries：检索和状态访问必须匹配当前课程及授权学习者。证据不足说明不足；冲突未消解先澄清。普通教材中的命令不能覆盖平台权限。授权教师的解析模式按已发布规则处理。
2. reasoning：分别检查答案和解释，定位概念矛盾、局部失误和指代歧义。有限例子不证明普遍结论；已有充分证据时避免机械追问。诊断只能覆盖当前证据支持的范围。
3. hints：记录概念提示、局部解法和完整答案不同层级。照抄完整答案不等于独立掌握。同模板改写不等于迁移。根据课程模式和进展选择提示、示例或解析。
4. tools：超时、损坏结果与不合量规的兜底分数不得进入掌握更新。状态写入检查版本和幂等性。只有已验证、已发布且条件匹配的经验能在线生效。
''')
    dump(Path('configs/experiment.json'),{'status':'design_only_not_executed','seed':20261020,'initial_version':'v0-frozen','real_model_enabled':False,
       'arms':{'A':{'tasks':'fixed_dev','updates':'none'},'B':{'tasks':'fixed_dev','updates':'controlled'},'C':{'tasks':'adaptive_dev_only','updates':'controlled'}},
       'matched_constraints':['same_initial_version','same_effective_task_count','same_candidate_update_count','same_review_budget','same_model_and_tools','same_call_budget'],
       'max_rounds':3,'max_candidates_per_round':2,'effective_task_count_per_arm':60,'max_adaptive_candidates':30,
       'budget_status':'disabled_until_small_run_metering_and_budget_set','release':{'requires_teacher_approval':True,'new_critical_regressions_allowed':0,'target_error_must_decrease':True},
       'holdout_access':'final_evaluator_only_after_versions_frozen','generation_cost':'report_separately','measured_results':None})
    dump(Path('configs/experience_registry.json'),{'version':'0.1.0','entries':[],'note':'No verified experiences have been produced. Pending ideas are not deployed.'})
    # Minimal JSON Schema for consumers; Python validator additionally checks provenance and grouping.
    schema={'$schema':'https://json-schema.org/draft/2020-12/schema','title':'Teaching bootstrap record v0.1','type':'object',
      'required':['schema_version','id','kind','course_id','concept_id','family_id','source_refs','reference','checks'],
      'properties':{'schema_version':{'const':'0.1.0'},'id':{'type':'string','minLength':1},'kind':{'enum':['learning','eval']},
                    'course_id':{'type':'string'},'concept_id':{'type':'string'},'family_id':{'type':'string'},'source_refs':{'type':'array','minItems':1,'items':{'type':'string'}},
                    'reference':{'type':'object'},'checks':{'type':'object'}},
      'allOf':[{'if':{'properties':{'kind':{'const':'learning'}}},'then':{'required':['prompt']}},
               {'if':{'properties':{'kind':{'const':'eval'}}},'then':{'required':['initial_state','messages','tool_fixtures','split'],'properties':{'split':{'enum':['dev','validation','test']},'messages':{'type':'array','minItems':1,'maxItems':3}}}}]}
    dump(Path('record.schema.json'),schema)

    pages=[
    ('通用插件化 AI 助教平台\n实施初步方案',[
      ('项目定位','通用内核服务多课程；课程知识、评价量规和策略放入课程包。学生教学与离线评测改进分开。基于用户 2026.10.20 的 8 页整合方案，首批制作 Python、AI 通识两个示范课包和通用平台测试。'),
      ('本次已交付','180 条候选数据、两个草稿课程包、9 份来源快照与证据索引、构建与核验脚本、CSV 审核表、接口定义和 DEV 数据适配器。初始 12 条小样本通过后再扩展。'),
      ('交付范围','本次没有搭建完整 Web 平台，没有真实模型调用或学生试用，没有运行自适应进化实验。所有学习者记录为合成数据。平台通用性需要后续真实接入测试证明。'),
      ('建议路线','保持 DS-H + 通用教学内核 + 能力插件。复用旧数据集 Agent 的生成、验证、去重与导出设计；新增教学数据适配器。旧工作区只读，不整合多个完整教学应用。'),
      ('当前基础','原数据集 Agent 已有程序生成和模拟调度；原 Harness 调研有固定版本短任务验证。本包的适配器只完成兼容形状和 DEV 分区防护检查，未启动 Harness，不能视为完成端到端集成。'),
    ]),
    ('01 运行架构与最小接口',[
      ('分层职责','Web 界面 → 通用教学内核 → 课程包与插件 → DS-H 执行适配。内核统一管理学习证据、动作选择和状态版本；插件返回结构化结果，不直接跨课程写学生状态。'),
      ('CoursePack 与 LearningItem','CoursePack 保存课程版本、目标、知识点、证据、评分和插件需求。LearningItem 保存学生练习、答案、解释、提示与来源。先修关系在课包中标为待教师确认。'),
      ('EvalCase 与 ExperienceEntry','EvalCase 保存初始状态、最多三轮用户脚本、工具夹具、允许动作、禁止行为和预期状态。ExperienceEntry 保存失败证据、假设、条件、独立验证和发布状态。现有经验库为空。'),
      ('三项基础能力','retrieve_evidence：取当前课程证据；generate_task：按课包目标选择或构建任务；verify_submission：客观工具核验与开放量规评阅。教学控制器依据证据选择追问、提示、补练或迁移复查。'),
      ('适配与边界','adapters/dataset_candidate.mjs 将 DEV 评测映射为旧 Candidate 的 instruction、referenceAnswer、spec、group 等字段。validation/test 输入被拒绝。返回的参考答案只能由评测组件使用，不能交给学生 Agent。'),
    ]),
    ('02 数据集构成与来源',[
      ('数据配额','学生练习 60 条：Python 30、AI 通识 30。平台评测 120 条：Python 40、AI 通识 40、通用行为 40。后者由 60 个任务家族组成，每家族有正常和异常两种案例。'),
      ('课程覆盖','Python：列表对象与浅拷贝、循环边界、可变默认参数、返回与输出。AI 通识：训练与推理、数据划分、过拟合与泛化、生成事实核验。通用行为：身份和课程边界、解释诊断、提示依赖、工具与状态处理。'),
      ('实际来源','下载 Python 3.13 教程三页及许可、Google 术语表和两页课程、MBPP sanitized JSON 与数据卡，共 9 份快照。MBPP 原始快照有 427 条，本包只选 ID 62、240、460、591、629 五条适用练习。'),
      ('证据和许可','保存原始 URL、定位锚点、SHA-256 和许可告知。Python 文档为 PSF 许可，文档代码另有 0BSD；Google 页面注明 CC-BY-4.0 / Apache-2.0 及例外；MBPP 数据卡标 CC-BY-4.0。自建内容与改编内容分别标识。'),
      ('数量含义','180 是候选数。外部测试不是完备性证明；中文题面与开放量规尚待教师审查。公开题可能已在模型预训练中出现，不能据此声称测试对模型绝对未见。'),
    ]),
    ('03 质量核验与数据隔离',[
      ('实际检查结果',f"结构、引用与分区检查未发现错误；{quality['fixed_code_output_verified_records']} 条记录的输出通过核验，涉及 {quality['unique_fixed_code_programs']} 个不同自建程序。5 条外部代码未在宿主执行。教师审核 0 条；真实模型调用 0 次。"),
      ('核验不能替代什么','程序输出核验不验证教学解释量规；来源可定位不代表语义已审核。平台夹具是预设环境，不是真实工具执行。所有开放教学判断和正式发布标准仍需人工确认。'),
      ('分区与去重',f"评测按家族分为开发 60、验证 30、测试 30。归并同一代码骨架后划分，学习题相关骨架不能进入验证或测试。相似度筛查记录 {quality['near_duplicate_pairs']} 对，其中 {quality['near_duplicate_review_pairs']} 对同区练习待复查；跨分区相似冲突为 0。"),
      ('导出与访问','学生输入采用字段白名单；工具夹具与参考答案由评测控制器独立加载。完整主数据、catalog 和审核表只供构建/审核环境。runtime_bundle 仅含课程资料和学习输入；optimizer_dev_bundle 不含验证/测试。目录分离需后续部署权限配合。'),
      ('失败与人工审核','下载、构建与核验失败保留原因；争议项不进入正式经验库。审核 CSV 是生成视图，人工工作副本另存。MBPP 需隔离执行并补充边界测试，同区相似对需决定保留或重写。'),
    ]),
    ('04 实施顺序、对照与验收',[
      ('第一阶段：数据与接口','先审核目标和量规，接通来源检索与数据适配；固定版本和种子。运行标准库数据构建、核验和验收脚本，保存重建哈希。当前交付即此阶段的候选基础。'),
      ('第二阶段：教学原型','采用一个教学 Agent、三个基础能力和轻量状态存储。先在一门课程跑通问答、诊断、补练和反馈，再以课包接入第二课程，记录内核变更与插件复用。'),
      ('第三阶段：评测与改进','比较 A 固定基线、B 固定任务进化、C 自适应任务进化。B/C 匹配有效任务数量、审核和调用预算；最多三轮、每轮两项候选。预算尚未实测，实验配置默认不启动付费调用。'),
      ('发布与回退','先排除坏题和工具故障，再提出最小配置改动；独立验证与固定回归后由教师审核发布。目标错误须减少，不新增关键回归错误，费用需在预算内。参考答案、权限、评分量规和模型权重不纳入自动改写。'),
      ('作品验收','交付可用教学平台、审核课包、独立测试和一轮有记录的改进；当前无效果数据，不填造收益。演示依次展示课程接入、学生错因与补练、后台失败证据、新旧配置对照、经验条件与回退。'),
      ('阅读与重建','先看 README.md 和质量报告，再复制审核表开展教师复核。scripts/check_reproducibility.py 使用相同来源快照在临时目录重建。实现平台时只给各运行角色挂载相应最小数据包。'),
    ])]
    md=['# 通用插件化 AI 助教平台：实施初步方案','','日期：2026-10-20。初步工程计划与首批数据交付。','']
    for title,sections in pages:
        md += ['## '+title.replace('\n','：'),'']
        for heading,text in sections:md += ['### '+heading,'',text,'']
    md += ['## 可复现命令','','见 README.md；数据制作不调用付费模型，真实模型及 Web 平台另按后续阶段实施。','',
           '依据：用户提供的《插件化AI助教平台项目总体方案(1).pdf》（2026.10.20，8 页）。本包没有改写原 PDF。']
    write(Path('实施初步方案.md'),'\n'.join(md))
    build_pdf(pages)

def build_pdf(pages):
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.ttfonts import TTFont
    from reportlab.platypus import SimpleDocTemplate,Paragraph,PageBreak,Spacer
    from reportlab.lib.styles import ParagraphStyle
    from reportlab.lib.pagesizes import A4
    from reportlab.lib import colors
    pdfmetrics.registerFont(TTFont('CN','C:/Windows/Fonts/msyh.ttc',subfontIndex=0))
    pdfmetrics.registerFont(TTFont('CNB','C:/Windows/Fonts/msyhbd.ttc',subfontIndex=0))
    styles={
      'title':ParagraphStyle('title',fontName='CNB',fontSize=23,leading=33,spaceAfter=15,textColor=colors.HexColor('#18364c'),wordWrap='CJK'),
      'head':ParagraphStyle('head',fontName='CNB',fontSize=12,leading=19,spaceBefore=11,spaceAfter=6,keepWithNext=True,wordWrap='CJK'),
      'body':ParagraphStyle('body',fontName='CN',fontSize=10.5,leading=18,spaceAfter=9,wordWrap='CJK'),
      'small':ParagraphStyle('small',fontName='CN',fontSize=9,leading=15,spaceAfter=15,wordWrap='CJK',textColor=colors.HexColor('#596774'))}
    story=[]
    for i,(title,sections) in enumerate(pages):
        if i:story.append(PageBreak())
        story.append(Paragraph(escape(title).replace('\n','<br/>'),styles['title']))
        if i==0:story.append(Paragraph('2026.10.20 / 初步实施与首批数据 / v0.1',styles['small']))
        for heading,text in sections:
            story.append(Paragraph(escape(heading),styles['head']))
            story.append(Paragraph(escape(text),styles['body']))
    def chrome(c,doc):
        c.setFillColor(colors.HexColor('#687785'));c.setFont('CN',8)
        c.drawString(46,A4[1]-29,'通用插件化 AI 助教平台 / 首批数据交付')
        c.setStrokeColor(colors.HexColor('#d4dce3'));c.line(46,38,A4[0]-46,38)
        c.drawString(46,24,'2026.10.20 · 方案与候选数据，待教师审核')
        c.drawRightString(A4[0]-46,24,str(doc.page))
    SimpleDocTemplate(str(ROOT/'实施初步方案.pdf'),pagesize=A4,leftMargin=46,rightMargin=46,topMargin=55,bottomMargin=52,
        title='通用插件化 AI 助教平台：实施初步方案与首批数据',author='项目方案').build(story,onFirstPage=chrome,onLaterPages=chrome)

if __name__=='__main__':main()
