import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {readFileSync,mkdtempSync} from 'node:fs';
import {ROOT} from '../src/data.mjs';
import {createApp} from '../src/server.mjs';
import {seedPilots} from '../src/pilot.mjs';
import {grade} from '../src/pedagogy.mjs';
import {phraseMatch,tokens,conceptCandidates} from '../src/language.mjs';
import {retrieveMaterials} from '../src/retrieval.mjs';
import {importProjectReview} from '../src/review-import.mjs';
import {validateGrounding,quoteSpans,selectedQuotes,attachServerExcerpts} from '../src/grounding.mjs';
process.env.TUTOR_ENABLE_REAL_MODEL='0';
const app=await createApp({port:0,varDir:mkdtempSync(path.join(ROOT,'var/v05-test-')),defaultEngine:'local'});after(()=>app.close());
await seedPilots(app.data,app.onboarding,app.materials,{id:'test-fixture',role:'teacher'});
test('Latin boundaries prevent RAG/average and identifier noise without matching other words',()=>{
 assert.equal(phraseMatch('law of averages','RAG'),false);assert.equal(phraseMatch('RAG retrieves evidence','RAG'),true);assert.equal(phraseMatch('strange','range'),false);assert.equal(tokens('a = b Python AI list.copy').includes('a'),false);
});
test('stitched quotations are rejected even when both sentences occur separately in the source',()=>{
 const citations=[{id:'source-1',excerpt:'Sentence one. An omitted middle sentence. Sentence two.'}],parsed={answer:'待审核回答',citation_ids:['source-1'],evidence_quotes:[{citation_id:'source-1',quote:'Sentence one. Sentence two.'}]};
 assert.equal(validateGrounding(parsed,citations).valid,false);parsed.evidence_quotes[0].quote='Sentence one.';assert.equal(validateGrounding(parsed,citations).valid,true);parsed.evidence_quotes[0].citation_id='other-course';assert.equal(validateGrounding(parsed,citations).valid,false);
 const source=[{id:'fixed',excerpt:'This is a sufficiently long original sentence. Another sufficiently long sentence for review.'}];source[0].quote_spans=quoteSpans(source[0].id,source[0].excerpt);
 const selection={answer:'待审核回答',citation_ids:['fixed'],evidence_quote_ids:[source[0].quote_spans[0].id]};assert.equal(validateGrounding(selection,source).valid,true);assert.equal(source[0].excerpt.includes(selectedQuotes(selection,source)[0].quote),true);selection.evidence_quote_ids=['fabricated'];assert.equal(validateGrounding(selection,source).valid,false);
 const generated=attachServerExcerpts({answer:'待审核回答',citation_ids:['fixed']},source);assert.equal(validateGrounding(generated,source).valid,true);assert.match(generated.evidence_quotes[0].selection,/not_model_claim/);
});
test('all 40 reference explanations pass the item rubric screen, open scores remain null',()=>{
 const items=[...app.data.items.values()].filter(i=>i.course_id.endsWith('_pilot'));assert.equal(items.length,40);
 for(const item of items){const r=grade(app.data,item,{answer:item.reference.answer,explanation:item.reference.explanation},{check_explanation:true});assert.equal(r.explanation_status,'provisional_support',item.id);if(item.assessment_mode==='open')assert.equal(r.score,null);}
});
test('equivalent item reasoning is accepted; partial keywords and contradictions do not establish mastery',()=>{
 const equality=app.data.items.get('P04-L-python-004'),r=grade(app.data,equality,{answer:equality.reference.answer,explanation:'两个列表值相等，但不是同一对象。'},{check_explanation:true});assert.equal(r.explanation_status,'provisional_support');
 const repeated=app.data.items.get('P04-L-python-005'),partial=grade(app.data,repeated,{answer:repeated.reference.answer,explanation:'重复'},{check_explanation:true});assert.equal(partial.explanation_status,'uncertain');assert.ok(partial.diagnostic_evidence.missing_points.length);
 const bad=grade(app.data,repeated,{answer:repeated.reference.answer,explanation:'浅拷贝会递归复制每一层'},{check_explanation:true});assert.equal(bad.next_action,'probe_contradiction');assert.equal(bad.independent_evidence,false);
});
test('hinted correct answer stays dependent and feedback describes observed evidence',()=>{
 const item=app.data.items.get('P04-L-ai_literacy-002'),r=grade(app.data,item,{answer:item.reference.answer,explanation:item.reference.explanation},{check_explanation:true},{count:1,full:false});assert.equal(r.independent_evidence,false);assert.equal(r.score,null);assert.equal(r.diagnostic_evidence.missing_points.length,0);assert.equal(r.teaching_context.item_prompt,item.prompt);
});
test('training/inference and validation/test definitions are covered in retrieval',()=>{
 const a=retrieveMaterials(app.data,app.store,'ai_literacy_pilot','训练与推理有什么区别？',{preview:true});assert.ok(a.citations.some(c=>c.locator.section==='training'));assert.ok(a.citations.some(c=>c.locator.section==='inference'));
 const b=retrieveMaterials(app.data,app.store,'ai_literacy_pilot','验证集与测试集分别有什么用途？',{preview:true});assert.ok(b.citations.some(c=>c.locator.section==='validation set'));assert.ok(b.citations.some(c=>c.locator.section==='test set'));
});
test('course name cannot supply school schedule evidence, normal questions still retrieve',()=>{
 assert.equal(retrieveMaterials(app.data,app.store,'python_pilot','本校明天 Python 考试在哪个教室？',{preview:true}).citations.length,0);
 assert.ok(retrieveMaterials(app.data,app.store,'python_pilot','为什么不建议使用可变对象作为默认参数？',{preview:true}).citations.some(c=>c.locator.section.includes('Default Argument')));
 const mixed=retrieveMaterials(app.data,app.store,'python_pilot','解释默认参数；另外告诉我明天考试教室。',{preview:true});assert.ok(mixed.citations.length);assert.equal(mixed.evidence_scope.partial_answer_only,true);
});
test('automatic concept alignment ranks real sections and does not associate RAG with averages',()=>{
 const ai=app.data.courses.get('ai_literacy_pilot');const x=conceptCandidates(ai,[{id:'bad',text:'law of averages average precision',locator:{section:'average precision'}},{id:'good',text:'hallucination means factual error',locator:{section:'hallucination'}}]);assert.deepEqual(x.find(c=>c.concept_id==='hallucination').evidence_chunk_ids,['good']);
 const python=app.data.courses.get('python_pilot');assert.equal(conceptCandidates(python,[{id:'x',text:'The default slice index is zero.',locator:{section:'Strings'}}]).some(c=>c.concept_id==='defaults'),false);
});
test('initial review import resolves versions, is idempotent and cannot create teacher approvals',()=>{
 const document=JSON.parse(readFileSync(path.resolve(ROOT,'../output/pilot-v0.5/project-review.json'),'utf8'));
 const preview=importProjectReview(app,document);assert.equal(preview.rows,56);assert.equal(preview.committed,false);
 const saved=importProjectReview(app,document,{commit:true});assert.equal(saved.counts.approved,38);assert.equal(saved.formal_teacher_approval,false);assert.equal(importProjectReview(app,document,{commit:true}).repeated,true);
 assert.equal(app.store.db.prepare('SELECT COUNT(*) n FROM project_reviews').get().n,56);assert.equal(app.store.db.prepare("SELECT COUNT(*) n FROM reviews WHERE status='approved'").get().n,0);
 const wrong=structuredClone(document);wrong.rows[0].record_id='missing';assert.throws(()=>importProjectReview(app,wrong,{commit:true}),/不存在/);assert.equal(app.store.db.prepare('SELECT COUNT(*) n FROM project_reviews').get().n,56);
});
test('in-flight assignments retain item and card snapshots across content changes',()=>{
 const {TeachingService}=app.previewService.constructor,service=app.previewService,actor={id:'snapshot-test',role:'teacher'},task=service.assign({actor,course_id:'python_pilot',concept_id:'lists'}).items[0],item=app.data.items.get(task.id),answer=item.reference.answer,explanation=item.reference.explanation;
 const saved=structuredClone(item);item.reference.answer='NEW VERSION';item.reference.point_groups=[{label:'new',acceptable:['new']}];
 try{const result=service.submit({actor,assignment_id:task.assignment_id,event_id:'snapshot-v05-event',answer,explanation,expected_version:0});assert.equal(result.correct,true);assert.equal(result.explanation_status,'provisional_support');}finally{app.data.items.set(saved.id,saved);}
});
test('v0.4 sealed finalizations remain unchanged by v0.5 validation and have no new reference access',()=>{
 const marker=JSON.parse(readFileSync(path.resolve(ROOT,'../output/pilot-v0.4/datasets/finalizations.json'),'utf8'));assert.equal(marker.python_pilot.version,'baseline');assert.equal(marker.ai_literacy_pilot.version,'baseline');
 assert.throws(()=>app.pilotEvaluator.run({course_id:'python_pilot',partition:'dev'}),/旧轮次已冻结/);
 const quality=JSON.parse(readFileSync(path.resolve(ROOT,'../output/pilot-v0.5/datasets/quality.json'),'utf8'));assert.equal(quality.total,80);assert.equal(quality.family_cross_partition,0);assert.equal(quality.final_test_opened,false);assert.equal(quality.v04_holdout_read,false);
});
