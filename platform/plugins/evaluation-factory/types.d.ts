export type ReviewStatus='pending'|'approved'|'needs_revision'|'rejected';
export interface EvaluationDataset {id:string;course_id:string;mode:'offline'|'longcat';arm:'A'|'B'|'C';seed:number;count:number;snapshot_digest:string;status:string;human_review:string;revision:number;sealed_read:false}
export interface EvaluationCase {id:string;dataset_id:string;course_id:string;concept_id:string;family_id:string;parent_family:string;scenario:string;variant:'normal'|'abnormal';public:Record<string,unknown>;oracle:Record<string,unknown>;source_refs:string[];revision:number;digest:string;validation:{status:'pending'|'passed'|'quarantined';teacher_verified:false};review:{status:ReviewStatus}}
export interface EvaluationExperiment {id:string;course_id:string;seeds:number[];dataset_ids:string[];status:string}
export interface FailureEvidence {case_id:string;case_revision:number;failure_type:string|null;confirmed_failure:boolean;failed_check_names:string[];trials:Record<string,unknown>[]}
export interface EvaluationRun extends FailureEvidence {id:string;dataset_id:string;checks:{name:string;passed:boolean;kind:'objective'}[];real_model_calls:number;stable:boolean;pending_semantic:boolean}
