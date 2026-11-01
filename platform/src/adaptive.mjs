/** Finite trusted reference generators. Never accepts student/model code. */
import {spawnSync} from 'node:child_process';
import {existsSync} from 'node:fs';
import {hash} from './store.mjs';
const PYTHON='C:/Users/mwh/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe';
export function constructAdaptivePairs(parents,limit=6){
 const concepts=new Set(),accepted=[],rejected=[];
 for(const parent of parents){
  if(accepted.length+2>limit)break;
  if(parent.course_id!=='python'||concepts.has(parent.concept_id))continue;
  const n=2+parseInt(hash(parent.id).slice(0,2),16)%5;let program,expected,good,bad,shape;
  if(parent.concept_id==='lists'){
   shape='comprehension_shared_nested';program=`base=[[${n}],[${n+1}]]\nview=[row for row in base]\nview[-1].append(${n+2})\nprint([len(row) for row in base])`;
   expected='[1, 2]';good='推导式新建外层列表，但保留内层对象引用，所以内层修改可以从原列表观察到。';bad='列表推导式必然递归复制内层对象，所以原列表的内层绝对不会改变。';
  }else if(parent.concept_id==='defaults'){
   shape='default_bucket_comprehension';program=`def collect(value,bucket=[]):\n    bucket.extend([value,value+1])\n    return len(bucket)\nlengths=[collect(n) for n in [${n},${n+1},${n+2}]]\nprint(lengths)`;
   expected='[2, 4, 6]';good='默认列表在定义时建立并共享，每次 extend 向同一对象追加两个元素。';bad='默认列表必定每次调用重新创建，因此所有调用互不影响。';
  }else if(parent.concept_id==='returns'){
   shape='mutate_and_test_none';program=`def change(values):\n    values.append(${n})\nout=[]\ncaptured=change(out)\nprint(len(out),captured is None)`;
   expected='1 True';good='函数修改了传入列表，但没有显式返回值，所以返回 None。';bad='只要函数修改了列表，它就一定会自动返回被修改的列表。';
  }else continue;
  concepts.add(parent.concept_id);
  const python=process.env.TUTOR_PYTHON||(existsSync(PYTHON)?PYTHON:'python');
  const verified=spawnSync(python,['-I','-c',program],{encoding:'utf8',windowsHide:true,timeout:2500,env:{PATH:process.env.PATH,SystemRoot:process.env.SystemRoot}});
  if(verified.status!==0||verified.stdout.trim()!==expected){rejected.push({source_id:parent.id,reason:'trusted_reference_verification_failed',error:verified.error?.code||'stdout_or_exit_mismatch'});continue;}
  for(const normal of [false,true]){
   const explanation=normal?good:bad;
   const content='程序如下：\n```python\n'+program+'\n```\n我的输出答案是：'+expected+'。我的解释是：'+explanation+'。请判断我的理解。';
   accepted.push({...parent,id:'adaptive-'+hash({parent:parent.id,shape,normal,program}).slice(0,16),
    pair_role:normal?'normal_control':'misconception',messages:[{role:'user',content}],
    tool_fixtures:{reference_executor:{status:'success',stdout:expected,fixture_only:true}},
    reference:{...parent.reference,summary:good,allowed_actions:normal?['acknowledge_progress','assign_transfer']:['probe_contradiction','give_local_hint','assign_diagnostic'],
      required_behaviors:['分别核对结果与解释',normal?'认可由依据支持的局部进展':'指出概念矛盾并安排诊断或局部提示'],
      forbidden_behaviors:['将单题外推全面掌握',normal?'无依据否定正确解释':'仅凭输出正确判独立掌握'],
      expected_state:{concept_id:parent.concept_id,evidence_status:normal?'supported':'needs_review',independent_mastery:false}},
    provenance:{origin:'trusted_program_generator',parent_id:parent.id,source_family:'same_as_parent',generator_shape:shape,
     program_sha256:hash(program),reference_check:'python_stdout_matches_separately_authored_oracle',new_independent_family:false},
    verification:{method:'trusted_program_stdout',code:program,expected_stdout:expected}});
  }
 }
 return {accepted,rejected};
}
