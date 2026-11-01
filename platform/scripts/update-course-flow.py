from pathlib import Path
import shutil,sqlite3
root=Path(__file__).resolve().parents[2];staged={}
def edit(name,old,new):
 p=root/name;s=staged.get(p,p.read_text(encoding='utf-8-sig'));assert old in s,(name,old[:100]);staged[p]=s.replace(old,new)
edit('platform/src/onboarding.mjs','||!text(t.source.license,300)','')
edit('platform/src/onboarding.mjs','摘要、来源与许可、练习','摘要、来源、练习')
edit('platform/src/onboarding.mjs','license:t.source.license,','license:t.source.license||\'\',')
edit('platform/src/onboarding.mjs',"if(!pack.evidence.length||pack.evidence.some(e=>!text(e.license,500)))failure('课包需保留资料来源与许可说明');","if(!pack.evidence.length)failure('课包需保留资料来源');")
edit('platform/src/onboarding.mjs',"if(pack.evidence.length===0||pack.evidence.some(e=>!text(e.license,500)))failure('资料需保留来源与许可说明');","if(pack.evidence.length===0)failure('资料需保留来源');")
edit('platform/src/onboarding.mjs',' publish(id,notes,actor){',' checkPublish(id,notes){')
edit('platform/src/onboarding.mjs','   const metadata={...JSON.parse(row.metadata),reviewer:actor.id,',"  return {row,pack};\n }\n publish(id,notes,actor,after){\n  const {row,pack}=this.checkPublish(id,notes);\n   const metadata={...JSON.parse(row.metadata),reviewer:actor.id,")
edit('platform/src/onboarding.mjs',"notes});this.store.db.exec('COMMIT');","notes});after?.();this.store.db.exec('COMMIT');")
edit('platform/src/materials.mjs','source_url,license}=input||{}','source_url,license=\'\'}=input||{}')
edit('platform/src/materials.mjs',"||!license.trim()",'')
edit('platform/src/materials.mjs','来源 URL 与许可/使用依据','来源 URL')
edit('platform/src/pilot08.mjs',"import {PlatformGuide}","import {CourseGovernance} from './course-governance.mjs';\nimport {PlatformGuide}")
edit('platform/src/pilot08.mjs',"this.guide=new PlatformGuide(this);","this.guide=new PlatformGuide(this);this.governance=new CourseGovernance(this);")
edit('platform/src/pilot08.mjs','onboarding_status:c.onboarding_status,chapters:','onboarding_status:c.onboarding_status,release_request:this.governance.latest(c.course_id),chapters:')
edit('platform/src/pilot08.mjs',"  if(route==='/api/admin/users')", "  if(route==='/api/teacher/course-release-requests'&&method==='GET')return send(this.governance.list(actor));\n  const releaseReview=route.match(/^\\/api\\/admin\\/course-release-requests\\/([a-f0-9]+)\\/review$/);if(releaseReview&&method==='POST')return send(this.governance.review(actor,releaseReview[1],b));\n  if(route==='/api/admin/course-ownership')return send(this.governance.ownership(actor,course,method==='POST'?b:null));\n  if(route==='/api/admin/users')")
edit('platform/src/pilot08.mjs',"op==='publish'?this.onboarding.publish(id,b.notes,actor)","op==='publish'?this.governance.submit(actor,id,b.notes)")
edit('platform/src/pilot08.mjs',"return send(this.onboarding.publish(m[1],b.notes,actor))","return send(this.governance.submit(actor,m[1],b.notes))")
edit('platform/src/server.mjs'," const pilot=mode==='pilot'?", " if(mode==='pilot'&&existing&&!store.get('course_governance_schema')){mkdirSync(path.join(varDir,'backups'),{recursive:true});await backup(store.db,path.join(varDir,'backups/pre-course-governance-'+Date.now()+'.sqlite'));}\n const pilot=mode==='pilot'?")

# Current layout and classic UI share the same permission boundary and optional metadata.
for name in ['platform/prototype/live.js','platform/public/pilot08.js']:
 s=(root/name).read_text(encoding='utf-8-sig')
 for old,new in [("license=input('来源与许可'),",''),("field('来源与许可',license),",''),("text:text.value,license:license.value","text:text.value"),("license=input('许可说明')",'unusedLicense=null'),("field('许可说明',license),",''),("license:license.value,",''),("p(m.license||''),",'')]:s=s.replace(old,new)
 staged[root/name]=s
edit('platform/prototype/live.js',"if(s.tab==='release'){const releaseNotes=area('课程发布审核说明');", "if(s.tab==='release'){const releaseNotes=area('发布申请说明');")
edit('platform/prototype/live.js',"field('发布说明',releaseNotes),button('确认发布课程'", "p(c.release_request?'最近申请：'+({pending:'待管理员审批',approved:'已批准',rejected:'已退回',superseded:'内容已更新'})[c.release_request.status]+'；'+(c.release_request.decision_notes||''):'完成资料和题目审核后提交，管理员批准后才向学生开放。'),field('申请说明',releaseNotes),button('提交发布申请'")
edit('platform/prototype/live.js',"...(s.user.role==='admin'?['账号与运行治理']:[])","...(s.user.role==='admin'?['课程发布审批','账号与运行治理']:[])")
edit('platform/prototype/live.js',"'账号与运行治理':'管理中心'","'课程发布审批':'课程审批','账号与运行治理':'管理中心'")
edit('platform/prototype/live.js',"if(s.view==='账号与运行治理')return await admin(main);","if(s.view==='课程发布审批')return await releaseApprovals(main);\n if(s.view==='账号与运行治理')return await admin(main);")
edit('platform/public/onboarding.js',",license=input('来源与许可说明','填写许可、改编及使用依据')",'')
edit('platform/public/onboarding.js',"field('来源与许可说明',license),",'')
edit('platform/public/onboarding.js',',license:license.value','')
edit('platform/public/onboarding.js',"button('审核并发布课程'","button('提交发布申请'")
edit('platform/public/onboarding.js',"toast('课程已发布，学生端可以使用。')","toast('已提交发布申请，待管理员审批。')")
edit('platform/public/pilot08.js',"button('审核并发布首课'","button('提交发布申请'")
edit('platform/src/guide-knowledge.mjs','这些由授权教师处理。','课程资料与题目由授权教师准备，课程发布由管理员审批。')
edit('platform/src/guide-knowledge.mjs','课程必须先由教师审核发布','课程须经教师完成内容审核并由管理员批准发布')
edit('platform/src/guide-knowledge.mjs','学习目标、来源许可','学习目标、资料出处')
edit('platform/src/guide-knowledge.mjs','全部满足才由教师发布','全部满足后教师提交发布申请，由管理员批准或退回')
edit('platform/src/guide-knowledge.mjs',"'本人确认发布','审核全部完成后由教师本人发布；向导不会点击发布。'","'提交管理员审批','教师提交发布申请，管理员批准后开放；向导不会代为提交或批准。'")
edit('platform/src/guide-knowledge.mjs',"'账号与运行治理']);","'账号与运行治理','课程发布审批']);")

backup=root/'output/course-flow-change/source-backup';backup.mkdir(parents=True,exist_ok=True)
for p,s in staged.items():
 dest=backup/p.relative_to(root);dest.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(p,dest);p.write_text(s,encoding='utf-8')
print('updated',len(staged),'files')
