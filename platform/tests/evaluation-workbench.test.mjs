import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluationOverview} from '../public/evaluation-lab.js';
const item=(id,technical,review='pending')=>({id,validation:{status:technical},review:{status:review}});
test('teacher review workload excludes quarantined, unverified and decided cases',()=>{
 const s=evaluationOverview({cases:[item('a','passed'),item('b','quarantined'),item('c','pending'),item('d','passed','rejected'),item('e','passed','approved'),item('f','passed','needs_revision')],runs:[]});
 assert.equal(s.review_count,2);assert.deepEqual(s.issues.find(i=>i.id==='review').case_ids,['a','f']);assert.equal(s.issues.find(i=>i.id==='quarantined').owner,'maintainer');assert.equal(s.issues.find(i=>i.id==='pending').owner,'maintainer');
});
test('single failures and unstable runs remain review signals, not confirmed defects',()=>{
 const s=evaluationOverview({cases:[],runs:[{case_id:'a',confirmed_failure:false,stable:false,checks:[]},{case_id:'b',confirmed_failure:false,stable:true,checks:[{passed:false}]},{case_id:'c',confirmed_failure:true,stable:true,checks:[{passed:false}]}]});
 assert.equal(s.confirmed,1);assert.deepEqual(s.issues.find(i=>i.id==='signals').case_ids,['a','b']);assert.deepEqual(s.issues.find(i=>i.id==='confirmed').case_ids,['c']);assert.equal(s.issues.find(i=>i.id==='signals').owner,'joint');
});
test('frozen archives retain pending review and never become teacher approval',()=>{
 const s=evaluationOverview({status:'frozen',record_origin:'isolated_real_research_not_current_course_run',cases:[item('a','passed')],runs:[]});
 assert.equal(s.archive,true);assert.equal(s.frozen,true);assert.equal(s.review_count,1);assert.equal(s.teacher_approved,false);assert.match(s.issues[0].action,/离线/);
});
test('empty or successful technical runs do not imply teaching approval',()=>{
 const a=evaluationOverview({cases:[],runs:[]}),b=evaluationOverview({cases:[item('a','passed')],runs:[{case_id:'a',stable:true,checks:[{passed:true}]}]});
 assert.equal(a.runs,0);assert.equal(a.teacher_approved,false);assert.equal(b.confirmed,0);assert.equal(b.review_count,1);assert.equal(b.teacher_approved,false);
});
