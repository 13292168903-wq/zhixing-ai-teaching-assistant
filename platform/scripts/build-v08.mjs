import path from 'node:path';
import {mkdirSync,readFileSync,writeFileSync,existsSync} from 'node:fs';
import {ROOT} from '../src/data.mjs';
import {hash} from '../src/store.mjs';
export function buildV08(){
 const out=path.resolve(ROOT,'../output/pilot-v0.8');for(const d of ['course-packs','datasets','reports','screenshots'])mkdirSync(path.join(out,d),{recursive:true});
 const pack=JSON.parse(readFileSync(path.resolve(ROOT,'../output/pilot-v0.6/course-packs/python_pilot.json'),'utf8'));pack.manifest.version='0.8.0';pack.manifest.title='Python 基础 · 首课待审';pack.manifest.chapters=pack.manifest.concepts.map((c,i)=>({id:'chapter_'+(i+1),title:c.title,concept_ids:[c.id]}));
 const specs=[
 ['lists','alias_write','a=[1,2]\nb=a\nb[0]=9\nprint(a)','[9, 2]','赋值保留同一对象引用；通过别名修改元素可被原引用观察到。',['同一对象','同一份列表','指向相同列表'],['重新复制了列表','两个独立列表']],
 ['lists','outer_replacement','a=[1,2]\nb=a.copy()\nb[0]=9\nprint(a)','[1, 2]','浅拷贝创建新的外层列表；替换副本外层元素不改变原列表。',['新的外层','新列表','外层独立'],['所有层都独立']],
 ['lists','nested_mutation','a=[[1],[2]]\nb=a.copy()\nb[0].append(3)\nprint(a)','[[1, 3], [2]]','浅拷贝只复制外层，内层列表仍共享。',['内层共享','共享内层','内部列表相同'],['递归复制','内层不共享']],
 ['range','step_sum','s=0\nfor n in range(1,5,2):\n    s+=n\nprint(s)','4','range产生1、3，不包含终点5，求和得到4。',['不包含终点','不含5','只有1和3'],['包含5']],
 ['range','exclusive_bound','print(list(range(3)))','[0, 1, 2]','起点默认0，终点3不包含在序列中。',['不包含终点','不含3','到2结束'],['包含3']],
 ['range','continue_filter','out=[]\nfor i in range(4):\n    if i==2:\n        continue\n    out.append(i)\nprint(out)','[0, 1, 3]','continue跳过本轮后续语句，不终止整个循环。',['跳过本轮','跳过2','不终止整个循环'],['结束整个循环']],
 ['defaults','shared_calls','def f(x,a=[]):\n    a.append(x)\n    return a\nprint(f(1))\nprint(f(2))','[1]\n[1, 2]','默认列表在定义时创建并由省略参数的调用共享。',['定义时','共享默认列表','默认列表复用'],['每次新建默认列表']],
 ['defaults','none_sentinel','def f(x,a=None):\n    if a is None:\n        a=[]\n    a.append(x)\n    return a\nprint(f(1))\nprint(f(2))','[1]\n[2]','None哨兵使每次省略参数时在函数内新建列表。',['函数内新建','每次新建','None哨兵'],['共享一个列表']],
 ['defaults','binding_time','x=[1]\ndef f(a=x):\n    return a\nx=[9]\nprint(f())','[1]','默认参数在定义时绑定原列表，后来重新绑定x不改变已绑定对象。',['定义时绑定','重新绑定不改变','原来的列表'],['默认参数每次读取x']],
 ['returns','print_none','def f():\n    print(7)\nx=f()\nprint(x)','7\nNone','print产生可见输出；没有显式return，函数返回None。',['返回None','返回值是None','没有return'],['打印就是返回值']],
 ['returns','returned_expression','def f(n):\n    return n*2\nprint(f(3))','6','return把计算结果交给调用者，print负责显示它。',['交给调用者','返回6','返回计算结果'],['return直接打印']],
 ['returns','mutator_none','a=[1]\nr=a.append(2)\nprint(a)\nprint(r)','[1, 2]\nNone','append原地修改列表，方法返回None；修改与返回是不同维度。',['原地修改','append返回None','返回值为None'],['append返回新列表']]
 ];
 pack.items.forEach(i=>{i.course_version='0.8.0';i.metadata_status='needs_tagging';i.reference.explanation_required=true;});
 for(const [concept,structure,code,answer,explanation,aliases,errors] of specs){const id='P08-'+concept+'-'+structure;pack.items.push({id,course_id:'python_pilot',course_version:'0.8.0',concept_id:concept,family_id:'p08:'+concept+':'+structure,difficulty:'intro',structure_tag:structure,assessment_mode:'exact',task_type:'code_reading',prompt:'写出以下 Python 程序的标准输出，并解释依据：\n\n'+code,hints:['先跟踪本题对象、控制流或函数返回，不要只猜输出。'],reference:{answer,explanation,required_points:[explanation],rubric_version:2,explanation_required:true,unacceptable:errors,point_groups:[{label:explanation,acceptable:aliases}]},checks:{human_review:'pending',answer:'authored_pending_independent_review'},provenance:{kind:'project_authored_candidate',source:'Python 3.13 official tutorial; current course source index',teacher_verified:false}});}
 // Explicit repair candidate for the reported paraphrase; remains draft until a teacher accepts it.
 const first=pack.items.find(i=>i.id==='P04-L-python-001');if(first){first.reference.rubric_version=2;first.reference.point_groups=[{label:'两个变量引用同一列表',acceptable:['同一列表对象','同一份列表','指向相同列表','共用一个列表']},{label:'通过别名修改可见',acceptable:['从a观察到','a也显示这个改动','a也跟着变','通过其他引用观察到']}];}
 writeFileSync(path.join(out,'course-packs/python_pilot.json'),JSON.stringify(pack,null,2));
 const families=[];for(const c of pack.manifest.concepts)for(const item of pack.items.filter(i=>i.concept_id===c.id).slice(0,5)){families.push({course_id:'python_pilot',concept_id:c.id,item_id:item.id,family_id:'diagnostic:'+item.id});}
 // Per topic: deterministic allocation of 5 families, 2 or 3 dev, >=1 validation and sealed.
 const ordered=[...pack.manifest.concepts].sort((a,b)=>hash('42'+a.id).localeCompare(hash('42'+b.id))),rows=[];
 for(const f of families){const group=families.filter(x=>x.concept_id===f.concept_id),n=group.findIndex(x=>x.item_id===f.item_id),at=ordered.findIndex(c=>c.id===f.concept_id);let partition=n<2?'development':n===2?'validation':n===3?'sealed':at<2?'development':at===2?'validation':'sealed';
 const item=pack.items.find(i=>i.id===f.item_id),variants=[['supported',item.reference.explanation],['incorrect','结果正确就证明每次调用会重新复制全部对象。'],['uncertain','我可能知道输出，但不清楚对象或控制流依据。'],['contradiction',pack.cards.concepts[f.concept_id].contradictions[0]||'打印就是返回值']];
 for(const[label,text]of variants)rows.push({...f,id:'P08-D-'+rows.length,partition,prompt:item.prompt,reference_rubric:item.reference,content_digest:hash({prompt:item.prompt,reference:item.reference}),student_answer:item.reference.answer,student_explanation:text,candidate_label:label,teacher_labels:[],review_status:'pending_two_independent_teachers',source:'authored diagnostic candidate; not a teacher gold label',seed:42});}
 writeFileSync(path.join(out,'datasets/diagnostics.teacher.jsonl'),rows.map(x=>JSON.stringify(x)).join('\n')+'\n');writeFileSync(path.join(out,'datasets/diagnostics.public.jsonl'),rows.map(({candidate_label,teacher_labels,...x})=>JSON.stringify(x)).join('\n')+'\n');
 const stats={total:rows.length,families:families.length,partitions:Object.fromEntries(['development','validation','sealed'].map(p=>[p,rows.filter(x=>x.partition===p).length])),family_overlap:0,semantic_accuracy:'not_measured_pending_teacher_labels',transfer_candidates:specs.length,source_license:'Project-authored CC-BY-4.0, based on Python PSF docs; pending content review'};
 writeFileSync(path.join(out,'datasets/quality-report.json'),JSON.stringify(stats,null,2));
 return {pack,rows,stats,out};
}
if(process.argv[1]?.endsWith('build-v08.mjs'))console.log(JSON.stringify(buildV08().stats));

