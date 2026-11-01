/** Development-only flow demonstration. No actual holdout or paid model calls. */
import {mkdirSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import {ROOT,loadData} from '../src/data.mjs';
import {Store} from '../src/store.mjs';
import {Evaluator} from '../src/evaluation.mjs';
const store=new Store(':memory:'),evaluator=new Evaluator(loadData(),store),actor={id:'offline-pilot-operator'};
try{
 const initial=evaluator.run({partition:'dev',version:'v1-baseline'});
 const adaptive=evaluator.adaptive(actor);
 const candidate=evaluator.propose(actor),validation=evaluator.validate(candidate.id,actor);
 const report={scope:'development_pipeline_demonstration_not_controlled_AB_test',initial_development:{passed:initial.passed,total:initial.total},
  adaptive:{variants:adaptive.variants.length,generator_shapes:adaptive.new_generator_shapes,rejected:adaptive.rejected,new_independent_families:0},
  independent_validation:{baseline_passed:validation.baseline.passed,candidate_passed:validation.candidate.passed,total:validation.baseline.total,new_regressions:validation.new_regressions},
  candidate_status:validation.passed?'validated_pending_human_review':'rejected_no_independent_improvement',
  published_version:store.get('published_version'),verified_experiences:0,actual_holdout_opened:false,real_model_calls:0,
  note:'No empirical learning gain, full AutoBencher reproduction or actual human approval is claimed. A non-improving candidate is not published.'};
 mkdirSync(path.join(ROOT,'reports'),{recursive:true});writeFileSync(path.join(ROOT,'reports/evolution-pilot.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{store.close();}
