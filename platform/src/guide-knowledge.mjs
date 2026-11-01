export const GUIDE_VERSION='0.9.2';
export const GUIDE_MANIFEST={id:'platform_guide',version:GUIDE_VERSION,title:'小知使用向导',kind:'platform',trusted:true,entry:'plugins/platform-guide/index.mjs',operations:['answer'],dependencies:[],configuration:{course_binding_required:false},permissions:['own_guide_memory','role_filtered_manual','authorized_navigation']};
const all=['visitor','student','teacher','admin'],staff=['teacher','admin'];
export const GUIDE_ACTIONS=[
 {id:'login',roles:['visitor'],title:'查看登录与邀请入口',view:'auth',target:'auth'},
 {id:'student_home',roles:['student'],title:'前往学习工作台',view:'学习工作台'},
 {id:'student_class',roles:['student'],title:'加入班级与查看作业',view:'课程作业'},
 {id:'student_history',roles:['student'],title:'查看学习记录与复核反馈',view:'学习记录'},
 {id:'teacher_courses',roles:staff,title:'创建课程草稿',view:'课程工作台'},
 {id:'teacher_content',roles:staff,title:'查看课程内容与审核',view:'课程内容与审核',course:true},
 {id:'teacher_classes',roles:staff,title:'建班与布置作业',view:'班级与作业',course:true},
 {id:'teacher_reviews',roles:staff,title:'批阅、复核与讲评',view:'作答复核与讲评',course:true},
 {id:'teacher_plugins',roles:staff,title:'查看插件实验室',view:'插件实验室',course:true},
 {id:'teacher_intake',roles:staff,title:'查看批量课程接入',view:'课程批量接入与能力'},
 {id:'admin_accounts',roles:['admin'],title:'管理账号与课程授权',view:'账号与运行治理'},
 {id:'tasks',roles:['student','teacher','admin'],title:'查看模型任务',view:'模型任务'}
];
export const GUIDE_DOCS=[
 {id:'welcome',roles:all,title:'向导能做什么',keywords:['你好','你是谁','帮助','使用工具','怎么使用','怎么用','功能'],text:'我是小知，知行平台的使用向导。我可以解释功能，也可以分步指路；可用操作始终由登录账号的权限决定。我能打开对应页面、说明操作步骤，不会代你填写、提交、审核或评分。',actions:[]},
 {id:'login',roles:['visitor'],title:'登录、初始化与邀请注册',keywords:['登录','注册','账号','密码','邀请码','角色','切换'],text:'首次启动时由本人设置管理员账号、至少10位密码和显示名。已有账号直接登录。受邀教师或学生切换到“邀请码注册”，填写账号、密码、显示名、邀请码并阅读参与说明；注册成功后自动进入对应工作空间。更换身份要退出后使用另一账号；普通标签页共享登录身份。不要在帮助聊天里填写密码或密钥。',actions:['login']},
 {id:'student_permissions',roles:['student'],title:'学生可以上传课程吗',keywords:['上传','建课','创建课程','发布','审核','授权','老师权限'],text:'当前学生账号不能上传课程资料、建课、发布课程或批准题目。课程资料与题目由授权教师准备，课程发布由管理员审批。学生通过邀请码加入已发布课程所在班级，再提问、做作业和申请复核。个人文件上传学习暂未提供。',actions:['student_class']},
 {id:'join',roles:['student'],title:'学生加入班级',keywords:['加入','邀请码','看不到课程','没有课程','找课程','班级'],text:'向任课教师领取7天内有效且未撤销的邀请码。在“课程作业”的“加入新的班级”填写邀请码、阅读并确认参与说明后加入。课程须经教师完成内容审核并由管理员批准发布；已加入但仍看不到时请联系教师检查发布状态。',actions:['student_class']},
 {id:'homework',roles:['student'],title:'作业、提示和新结构练习',keywords:['作业','练习','提示','复测','学习','提交','答案'],text:'在“我的作业”打开教师发布的作业，分别填写答案和解释，再提交。提示次数会被记录；提示后答对不算独立完成。可选择同知识点新结构复查，题库不足时会明确说明。到期作业停止新增正式提交，延期请联系教师；独立完成后的次日与约七日复测会在登录后显示。',actions:['student_class','student_home']},
 {id:'review_student',roles:['student'],title:'学生申请复核',keywords:['复核','不理解','不识别','理由','解释','误判','反馈','成绩'],text:'“规则未识别”不等于理解错误。作答反馈中的“申请教师复核”会记录申请；教师可追加修正和依据，原始作答不覆盖。学习记录可查看有效反馈。帮助向导不修改客观分数或掌握状态，本机试点不作正式成绩。',actions:['student_history']},
 {id:'chat',roles:['student'],title:'连续问答与停止生成',keywords:['问答','聊天','停止','会话','回车','重试','历史','草稿','慢'],text:'从学习首页进入课程，课程学习分为“课程问答、练习与作业、本课学习记录”。Enter发送、Shift＋Enter换行；可以继续历史会话，输入草稿按账号保存。模型只接收最近三轮上下文。生成中可停止；失败后显式重试，不自动重放付费步骤。普通问候走本地回答。',actions:['student_home','tasks']},
 {id:'prepare',roles:staff,title:'备课、资料和首课发布',keywords:['资料','上传','建课','发布','草稿','课程','学生看不到'],text:'先在工作台创建草稿，仅填写课程名称、院系和负责教师；然后在我的课程继续备课，按步骤上传资料、整理知识点、添加练习、预览并提交审核。在我的课程进入课程备课，上传文本型PDF、DOCX、Markdown、TXT或HTML，检查原文定位，再审核资料、题目和量规。每个知识点需有练习；审核绑定当前版本，程序题需有效沙箱核验。全部满足后教师提交发布申请，由管理员批准或退回；发布后修改先另建待审修订版。扫描件暂不做OCR。',actions:['teacher_courses','teacher_content']},
 {id:'class_teacher',roles:staff,title:'建班和布置作业',keywords:['班级','作业','邀请码','学生','截止','延期','布置'],text:'在班级与作业创建教学班，进入班级的“学生与邀请”生成并转交邀请码；“作业”中按选择题目、作业信息、预览确认三步布置。课程发布后，从当前已审题库选择1—5道题，设置未来截止时间，创建草稿并确认发布。作业冻结题目、量规和策略。到期后保留查看复习；教师延期须填写依据。清单中的班级名称元数据不能代替真实成员授权。',actions:['teacher_classes']},
 {id:'review_teacher',roles:staff,title:'解释量规与教师复核',keywords:['量规','理由','解释','复核','误判','批阅','评分','讲评','工时'],text:'量规用表单维护正确要点、可接受表达、典型误区及解释是否必填。未识别时LongCat仅提出带学生原句的建议，不改客观分数和提示记录。到批阅与复核查看原始作答、参考量规和辅助建议，填写修正结论、反馈及依据。修正追加事件并重算局部状态；可导出讲评并记录投入分钟数。',actions:['teacher_content','teacher_reviews']},
 {id:'plugins',roles:staff,title:'三个教学插件与批量接入',keywords:['插件','生成','模拟','策略','批量','CSV','JSON'],text:'教师在“更多工具”进入插件实验室，提供教学数据生成、学生模拟和教学策略比较。生成内容默认待审，技术核验不等于教师批准。三个教学插件可按课程绑定；更多工具中的批量课程接入支持CSV/JSON清单和受信评阅插件。知行向导是平台级插件，不要求绑定课程。',actions:['teacher_plugins','teacher_intake']},
 {id:'admin',roles:['admin'],title:'管理员账号与模型治理',keywords:['账号','教师','授权','密钥','模型','额度','备份','恢复','清理','用量'],text:'在账号与平台管理创建教师账号并授权当前课程，或使用教师邀请。没有默认公开密码。LongCat密钥仅保存在本机进程环境，不能上传到帮助聊天。累计调用和费用默认不限，可设置额度。模型任务可查看消耗和取消；未知付费步骤不自动重放。创建备份后，数据库恢复须先停止服务；清理先预览并自动备份，历史备份单独管理。',actions:['admin_accounts','tasks']}
].map(d=>({...d,version:GUIDE_VERSION,source:'知行平台 v0.9 经代码核对的使用说明'}));
const step=(action,title,text,target)=>({action,title,text,target:target||null});
export const GUIDE_TOURS=[
 {id:'login',roles:['visitor'],title:'登录与邀请注册',steps:[step('login','确认入口','首次使用由本人初始化管理员；已有账号直接登录。','auth'),step('login','受邀注册','切换到邀请码注册，账号、密码由本人填写。','invite'),step('login','注册后登录','核对邀请码和参与说明，注册成功后自动进入工作空间。','auth')]},
 {id:'join',roles:['student'],title:'加入教学班',steps:[step('student_class','领取邀请','先向任课教师领取有效邀请码。'),step('student_class','进入我的作业','在加入新的班级处阅读说明并填写邀请码。','join'),step('student_class','确认课程开放','课程发布并加入班级后才会出现作业；没有课程请联系教师。')]},
 {id:'study',roles:['student'],title:'作业与复核',steps:[step('student_class','打开作业','选择教师已发布的作业，注意截止时间。'),step('student_home','填写答案和解释','分别说明结果与依据；提示会单独记录。','practice'),step('student_history','核对与复核','规则未识别不代表理解错误，可以在作答反馈中申请复核。'),step('student_home','继续学习','按今日建议复测或练习同概念新结构。')]},
 {id:'prepare',roles:staff,title:'备课到发布',steps:[step('teacher_courses','创建草稿','先准备学习目标、资料出处、题目与答案。'),step('teacher_content','核对资料','上传后检查文字、出处和定位；扫描件暂不支持。','materials'),step('teacher_content','审核题目量规','逐题确认正确要点、可接受表达和误区。'),step('teacher_content','提交管理员审批','教师提交发布申请，管理员批准后开放；向导不会代为提交或批准。','release')]},
 {id:'assign',roles:staff,title:'建班布置作业',steps:[step('teacher_classes','创建教学班','填写班级名称，创建后生成学生邀请。','class'),step('teacher_classes','准备题单','从已审题库选择1—5道题，并设置截止时间。','homework'),step('teacher_classes','预览并发布','确认草稿快照后，由教师本人发布。'),step('teacher_reviews','批阅与讲评','查看完成情况，追加复核并导出讲评。')]},
 {id:'accounts',roles:['admin'],title:'教师账号与授权',steps:[step('admin_accounts','建立独立账号','教师使用独立账号，密码由账号持有人妥善管理。','accounts'),step('admin_accounts','授权课程','选择教师和当前课程，由管理员本人授予权限。','grant'),step('tasks','核对运行','查看任务、调用与费用估算；实际费用以供应商账单为准。')]}
];
export const guideViews=new Set(['auth','学习工作台','课程作业','学习记录','我的数据','模型任务','课程工作台','课程内容与审核','课程批量接入与能力','班级与作业','作答复核与讲评','插件实验室','诊断标注与量规候选','账号与运行治理','课程发布审批']);
export const redactGuideText=text=>String(text).replace(/ak_[A-Za-z0-9_-]{12,}|sk-[A-Za-z0-9_-]{12,}/g,'[已移除密钥]');
