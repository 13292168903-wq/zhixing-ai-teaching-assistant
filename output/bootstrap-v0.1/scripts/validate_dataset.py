"""Validate provenance, code oracles, partition isolation and export boundaries."""
from pathlib import Path
import argparse, collections, copy, csv, difflib, hashlib, json, subprocess, sys
from build_dataset import ROOT, CONCEPTS, digest, export_views, dump, code_shape

def load_rows(path):return [json.loads(line) for line in path.read_text(encoding='utf-8').splitlines() if line.strip()]

def structural_errors(rows,evidence_ids,source_ids):
    errors=[];seen=set();family_splits=collections.defaultdict(set);shape_splits=collections.defaultdict(set)
    for r in rows:
        rid=r.get('id','<missing>')
        def error(s):errors.append({'id':rid,'reason':s})
        for k in ['id','kind','course_id','concept_id','family_id','split','checks','reference','source_refs','provenance','verification']:
            if k not in r:error('missing_'+k)
        if rid in seen:error('duplicate_id')
        seen.add(rid)
        course=r.get('course_id')
        if course not in CONCEPTS or r.get('concept_id') not in CONCEPTS.get(course,{}):error('unknown_course_or_concept')
        if r.get('kind') not in ['learning','eval']:error('unknown_kind')
        if not r.get('source_refs'):error('missing_source_refs')
        for ref in r.get('source_refs',[]):
            if ref.startswith('EV-') and ref not in evidence_ids:error('unknown_evidence_reference')
            if ref.startswith('mbpp_sanitized:') and 'mbpp_sanitized' not in source_ids:error('missing_mbpp_snapshot')
            if not (ref.startswith('EV-') or ref.startswith('mbpp_sanitized:') or ref.startswith('POLICY-v0.1:')):error('unknown_source_reference')
        if r.get('kind')=='eval':
            if r.get('split') not in ['dev','validation','test']:error('invalid_eval_split')
            messages=r.get('messages',[])
            if not 1<=len(messages)<=3 or any(m.get('role')!='user' for m in messages):error('invalid_short_script')
            reference=r.get('reference',{})
            for key in ['allowed_actions','required_behaviors','forbidden_behaviors','expected_state','rubric']:
                if not reference.get(key):error('missing_eval_reference_'+key)
        if r.get('kind')=='learning' and (not r.get('prompt') or not r.get('reference',{}).get('answer')):error('missing_learning_prompt_or_answer')
        if r.get('provenance',{}).get('origin')=='external_adapted' and r.get('verification',{}).get('method')!='external_code_not_executed':error('external_execution_not_allowed_in_bootstrap')
        family_splits[r.get('leakage_group',r.get('family_id'))].add(r.get('split'))
        code=r.get('verification',{}).get('code')
        if code:
            try:shape_splits[code_shape(code)].add(r.get('split'))
            except SyntaxError:error('invalid_reference_code')
    def leaking(splits):
        ev=splits&{'dev','validation','test'}
        return len(ev)>1 or ('learning' in splits and bool(ev&{'validation','test'}))
    for group,splits in family_splits.items():
        if leaking(splits):errors.append({'id':group,'reason':'family_split_leakage'})
    for shape,splits in shape_splits.items():
        if leaking(splits):errors.append({'id':hashlib.sha256(shape.encode()).hexdigest(),'reason':'code_skeleton_leakage'})
    return errors

def near_duplicates(rows):
    results=[]
    def text(r):return r.get('prompt',' '.join(x['content'] for x in r.get('messages',[])))
    for i,a in enumerate(rows):
        for b in rows[i+1:]:
            if a['course_id']!=b['course_id']:continue
            ratio=difflib.SequenceMatcher(None,text(a),text(b),autojunk=False).ratio()
            if ratio>=.88:
                same=a['leakage_group']==b['leakage_group']
                results.append({'a':a['id'],'b':b['id'],'similarity':round(ratio,4),
                    'disposition':'paired_or_grouped_case' if same else 'review_required',
                    'cross_partition':a['split']!=b['split']})
    return results

def verify(rows,pilot=False):
    evidence=json.loads((ROOT/'sources/evidence_index.json').read_text(encoding='utf-8'))
    sources=json.loads((ROOT/'sources/manifest.json').read_text(encoding='utf-8'))['sources']
    errors=structural_errors(rows,{e['id'] for e in evidence},{s['id'] for s in sources if s['status']=='downloaded'})
    for s in sources:
        if s['status']=='downloaded':
            if hashlib.sha256((ROOT/s['path']).read_bytes()).hexdigest()!=s['sha256']:
                errors.append({'id':s['id'],'reason':'source_hash_mismatch'})
    codes=sorted({r['verification']['code'] for r in rows if 'code' in r.get('verification',{})})
    process=subprocess.run([sys.executable,'-I',str(ROOT/'scripts/run_reference_worker.py')],
        input=json.dumps([{'code':code} for code in codes]),text=True,encoding='utf-8',capture_output=True,timeout=15)
    if process.returncode:raise RuntimeError(process.stderr)
    outputs={r['code']:r for r in json.loads(process.stdout)}
    objective=0
    for r in rows:
        r['checks']['structural']='pass' if not any(e['id']==r['id'] for e in errors) else 'fail'
        r['checks']['human_review']='not_reviewed'
        r['checks']['pedagogical_rubric']='review_required'
        code=r.get('verification',{}).get('code')
        if code:
            out=outputs[code]
            if out['status']!='executed_fixed_reference' or out['stdout']!=r['verification']['expected_stdout']:
                errors.append({'id':r['id'],'reason':'reference_stdout_mismatch','actual':out.get('stdout'),'expected':r['verification']['expected_stdout']})
                r['checks']['answer']='failed'
            else:r['checks']['answer']='fixed_code_output_verified';objective+=1
        elif r['provenance']['origin']=='external_adapted':r['checks']['answer']='pending_isolated_execution'
        elif r['course_id']=='platform':r['checks']['answer']='fixture_specification_only'
        else:r['checks']['answer']='source_linked_open_rubric_unreviewed'
    near=near_duplicates(rows)
    # Cross-partition near duplicates are quarantined for review, not silently certified.
    ambiguous=[x for x in near if x['disposition']=='review_required' and x['cross_partition']]
    for issue in ambiguous:errors.append({'id':issue['a']+'|'+issue['b'],'reason':'cross_partition_near_duplicate'})
    report={'mode':'pilot' if pilot else 'full','candidate_count':len(rows),'structural_errors':errors,
        'fixed_code_output_verified_records':objective,'unique_fixed_code_programs':len(codes),
        'human_reviewed':0,'real_model_calls':0,'external_code_executions':0,
        'answer_status_counts':dict(collections.Counter(r['checks']['answer'] for r in rows)),
        'eval_splits':dict(collections.Counter(r['split'] for r in rows if r['kind']=='eval')),
        'near_duplicate_pairs':len(near),'near_duplicate_review_pairs':sum(x['disposition']=='review_required' for x in near),
        'cross_partition_near_duplicates':len(ambiguous),
        'scope':'Checks validate corpus structure, provenance and fixed-code outputs. No tutor has been evaluated and open rubrics are not teacher-approved.',
        'python_version':sys.version.split()[0],'status':'pass_with_human_review_pending' if not errors else 'needs_correction'}
    dump(Path('reports/'+('pilot_validation.json' if pilot else 'quality.json')),report)
    dump(Path('reports/'+('pilot_near_duplicates.json' if pilot else 'near_duplicates.json')),near)
    if not pilot:
        export_views(rows)
        manifest=json.loads((ROOT/'data_manifest.json').read_text(encoding='utf-8'))
        manifest.update(candidate_sha256=digest(rows),quality_status=report['status'])
        dump(Path('data_manifest.json'),manifest)
    print(json.dumps(report,ensure_ascii=True))
    return report

def main():
    p=argparse.ArgumentParser();p.add_argument('--pilot',action='store_true');args=p.parse_args()
    path=ROOT/('reports/pilot_candidates.jsonl' if args.pilot else 'reviewer_private/all_candidates.jsonl')
    result=verify(load_rows(path),args.pilot)
    if result['structural_errors']:sys.exit(1)

if __name__=='__main__':main()
