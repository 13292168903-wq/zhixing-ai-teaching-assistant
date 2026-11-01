export function statisticsPack(){
 const course='statistics_pilot',url='https://docs.python.org/3.13/library/statistics.html',license='Project-authored examples/Chinese notes CC-BY-4.0; definitions based on Python statistics docs PSF-2.0';
 const definitions={
  mean:{title:'算术均值',aliases:['均值','平均数','mean','arithmetic mean'],summary:'算术均值是观测值总和除以观测个数；异常值会影响均值。空数据不能直接求均值。',points:['总和','个数'],hint:'先求和，再除以观测个数。'},
  median:{title:'中位数',aliases:['中位数','排序','median'],summary:'先按数值排序；奇数个观测取中间值，偶数个观测取中间两个数的算术平均。',points:['排序','中间'],hint:'先排序，再看观测个数是奇数还是偶数。'},
  sample_variance:{title:'样本方差',aliases:['样本方差','方差','variance','sample variance'],summary:'这里使用样本方差：各观测与均值之差的平方和除以 n-1，要求至少两个观测。不要与除以 n 的总体方差混用。',points:['平方和','n-1'],hint:'先计算均值，再累加离差平方，最后除以 n-1。'}
 };
 const pack={manifest:{schema_version:'0.6.0',course_id:course,title:'统计学基础 · 教学试点',version:'0.6.0',material_retrieval:true,required_capabilities:['retrieve_evidence','generate_task','verify_submission','numeric_check'],retrieval_terms:{均值:['mean','arithmetic mean'],平均数:['mean'],中位数:['median'],样本方差:['sample variance','variance']},concepts:[]},cards:{concepts:{}},evidence:[],items:[]};
 const sets=[[2,4,6],[1,3,7,9],[4,4,4,8],[1,2,3,4,5]];
 for(const [concept,c]of Object.entries(definitions)){
  pack.manifest.concepts.push({id:concept,title:c.title,learning_objective:'能说明'+c.title+'的计算过程与适用条件。',prerequisites:[]});
  pack.cards.concepts[concept]={aliases:c.aliases,summary:c.summary,support:c.points,contradictions:concept==='sample_variance'?['样本方差总是除以n']:[],rule_mode:'literal',probe:c.hint};
  pack.evidence.push({id:'stats-'+concept,concept_id:concept,text:c.summary,locator:url+'#statistics.'+(concept==='sample_variance'?'variance':concept),license,source_id:'python-statistics'});
  sets.forEach((values,i)=>{const n=values.length,mean=values.reduce((a,b)=>a+b,0)/n,sorted=[...values].sort((a,b)=>a-b),target=concept==='mean'?mean:concept==='median'?(n%2?sorted[(n-1)/2]:(sorted[n/2-1]+sorted[n/2])/2):values.reduce((a,b)=>a+(b-mean)**2,0)/(n-1),explanation=concept==='mean'?`总和为 ${values.reduce((a,b)=>a+b,0)}，个数为 ${n}，相除得到均值。`:concept==='median'?'排序后选中间位置；偶数个观测取中间两个值的平均。':`计算离差平方和，样本方差分母使用 n-1=${n-1}。`;
   pack.items.push({id:`P06-L-statistics-${concept}-${i+1}`,course_id:course,course_version:'0.6.0',concept_id:concept,assessment_mode:'plugin',task_type:'numeric_with_explanation',prompt:`数据为 [${values.join(', ')}]，计算${c.title}。提交一个数值（允许小数），并说明计算过程；样本方差采用 n-1 分母。`,hints:[c.hint],diagnostic_probe:c.hint,assessment:{capability:'numeric_check',config:{target,absolute_tolerance:0.00001,relative_tolerance:0.00001}},reference:{answer:String(target),explanation,required_points:c.points,point_groups:c.points.map(p=>({label:p,acceptable:[p,explanation]}))},provenance:{kind:'project_authored_fixed_numeric_example',values,statistic:concept,source_url:url},checks:{human_review:'pending'}});
  });
 }return pack;
}
