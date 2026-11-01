import {readFileSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import {ROOT} from '../src/data.mjs';
import {CodeSandbox,normalizeOutput} from '../src/code-sandbox.mjs';
const pack=JSON.parse(readFileSync(path.resolve(ROOT,'../output/pilot-v0.8/course-packs/python_pilot.json'))),sandbox=new CodeSandbox(),rows=[];
for(const item of pack.items.filter(i=>i.id.startsWith('P08-'))){const code=item.prompt.split('\n\n').slice(1).join('\n\n'),compiled=await sandbox.compile('python',code),result=compiled.ok?await sandbox.run(compiled,''):compiled.check,passed=compiled.ok&&result.code===0&&normalizeOutput(result.stdout)===normalizeOutput(item.reference.answer);rows.push({id:item.id,passed,expected:item.reference.answer,observed:result.stdout,code:result.code,image:result.image});console.log(item.id+': '+passed);}
writeFileSync(path.resolve(ROOT,'../output/pilot-v0.8/reports/course-answer-checks.json'),JSON.stringify({scope:'actual_docker_execution_of_project_authored_reading_examples_not_teacher_review',passed:rows.filter(r=>r.passed).length,total:rows.length,teacher_review:'pending',rows},null,2));if(rows.some(r=>!r.passed))process.exitCode=1;
