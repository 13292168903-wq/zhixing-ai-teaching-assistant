import collections, copy, hashlib, json, unittest
from pathlib import Path
from build_dataset import ROOT, code_shape
from validate_dataset import load_rows, structural_errors
from verify_references import verify_code

class Acceptance(unittest.TestCase):
 @classmethod
 def setUpClass(cls):
  cls.rows=load_rows(ROOT/'reviewer_private/all_candidates.jsonl')
  cls.evidence={e['id'] for e in json.loads((ROOT/'sources/evidence_index.json').read_text(encoding='utf-8'))}
  cls.sources={e['id'] for e in json.loads((ROOT/'sources/manifest.json').read_text(encoding='utf-8'))['sources'] if e['status']=='downloaded'}
 def errors(self,rows):return structural_errors(rows,self.evidence,self.sources)
 def test_counts_and_splits(self):
  self.assertEqual(len(self.rows),180)
  self.assertEqual(collections.Counter(r['kind']+':'+r['course_id'] for r in self.rows),{'learning:python':30,'learning:ai_literacy':30,'eval:python':40,'eval:ai_literacy':40,'eval:platform':40})
  self.assertEqual(collections.Counter(r['split'] for r in self.rows if r['kind']=='eval'),{'dev':60,'validation':30,'test':30})
 def test_valid_corpus(self):self.assertEqual(self.errors(self.rows),[])
 def test_missing_source_rejected(self):
  rows=copy.deepcopy(self.rows);rows[0]['source_refs']=['EV-not-found'];self.assertTrue(any(e['reason']=='unknown_evidence_reference' for e in self.errors(rows)))
 def test_duplicate_id_rejected(self):
  rows=copy.deepcopy(self.rows);rows[1]['id']=rows[0]['id'];self.assertTrue(any(e['reason']=='duplicate_id' for e in self.errors(rows)))
 def test_family_leak_rejected(self):
  rows=copy.deepcopy(self.rows);pair=[r for r in rows if r['kind']=='eval'][:2];pair[0]['split']='dev';pair[1]['split']='test'
  self.assertTrue(any(e['reason']=='family_split_leakage' for e in self.errors(rows)))
 def test_code_shape_leak_rejected(self):
  rows=copy.deepcopy(self.rows);r=next(x for x in rows if x['kind']=='eval' and 'code' in x['verification']);clone=copy.deepcopy(r)
  clone.update(id='injected-new-id',family_id='new-family',leakage_group='new-group',split='test' if r['split']!='test' else 'dev')
  rows.append(clone);self.assertTrue(any(e['reason']=='code_skeleton_leakage' for e in self.errors(rows)))
 def test_reference_output_and_guard(self):
  for r in self.rows:
   if 'code' in r['verification']:self.assertEqual(verify_code(r['verification']['code']),r['verification']['expected_stdout'])
  with self.assertRaises(ValueError):verify_code("print('unapproved reference')")
 def test_external_records_not_executed(self):
  external=[r for r in self.rows if r['provenance']['origin']=='external_adapted']
  self.assertEqual(len(external),5)
  for r in external:
   self.assertEqual(r['checks']['answer'],'pending_isolated_execution');self.assertTrue(r['function_signature']);self.assertTrue(r['public_tests'])
 def test_input_exports_exclude_grading_data(self):
  forbidden={'reference','verification','checks','tool_fixtures','expected_state','referenceAnswer','pair_role'}
  for path in [ROOT/'public/learning_inputs.jsonl',*list((ROOT/'eval').glob('*/inputs.jsonl')),ROOT/'evaluator_private/holdout/inputs.jsonl']:
   for row in load_rows(path):self.assertFalse(forbidden.intersection(row))
 def test_optimizer_dev_only(self):
  rows=load_rows(ROOT/'optimizer_allowed/dev_cases.jsonl');self.assertEqual(len(rows),60)
  self.assertTrue(all(r['split']=='dev' for r in rows))
 def test_evidence_has_content(self):
  evidence=json.loads((ROOT/'sources/evidence_index.json').read_text(encoding='utf-8'))
  self.assertTrue(all(len(e['text'])>=100 for e in evidence))
  expected={'EV-range-1':'range','EV-returns-1':'return','EV-lists-2':'shallow copy'}
  by_id={e['id']:e for e in evidence}
  for key,term in expected.items():self.assertIn(term,by_id[key]['text'])
 def test_controls_present(self):
  groups=collections.defaultdict(list)
  for r in self.rows:
   if r['kind']=='eval':groups[r['family_id']].append(r)
  self.assertEqual(len(groups),60)
  for group in groups.values():
   self.assertEqual(len(group),2);self.assertEqual(sum(r['pair_role']=='normal_control' for r in group),1)

if __name__=='__main__':unittest.main(verbosity=2)
