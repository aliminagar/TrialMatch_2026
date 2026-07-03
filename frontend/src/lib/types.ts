/**
 * Shared frontend types — a hand-maintained mirror of the backend Pydantic
 * contracts so every component is typed against the real wire shapes.
 *
 * Sources of truth (do not drift from these):
 *   backend/trialmatch/models/patient.py   (PatientProfile, Diagnosis, ...)
 *   backend/trialmatch/models/trial.py     (Criterion + enums)
 *   backend/trialmatch/models/match.py     (CriterionVerdict, TrialVerdict, MatchReport)
 *   backend/trialmatch/models/api.py       (SSE StreamEvent envelope)
 *   backend/trialmatch/agents/graph.py     (node names)
 */

// ---- enums (Literal unions on the backend) ---------------------------------

export type Sex = "male" | "female" | "other";

export type Verdict = "PASS" | "FAIL" | "INSUFFICIENT_INFO";

export type AggregateVerdict = "LIKELY_MATCH" | "LIKELY_NO_MATCH" | "NEEDS_REVIEW";

export type CriterionType = "inclusion" | "exclusion";

export type CriterionCategory =
  | "demographic"
  | "diagnosis"
  | "lab"
  | "medication"
  | "prior_treatment"
  | "performance"
  | "reproductive"
  | "other";

export type CriterionOperator =
  | "eq"
  | "ne"
  | "gt"
  | "lt"
  | "gte"
  | "lte"
  | "in"
  | "not_in"
  | "has"
  | "lacks";

export type InputMode = "structured" | "note";

// ---- patient-side models (models/patient.py) -------------------------------

export interface Diagnosis {
  icd10: string;
  description?: string | null;
}

export interface LabValue {
  value: number;
  unit: string;
  reference_range?: string | null;
  measured_on?: string | null; // ISO date
}

export interface GeoConstraint {
  country: string; // ISO 3166-1 alpha-2
  state?: string | null;
  city?: string | null;
  max_distance_km?: number | null;
}

export interface PatientProfile {
  age: number;
  sex: Sex;
  primary_diagnosis: Diagnosis;
  comorbidities: Diagnosis[];
  current_medications: string[];
  ecog_performance_status?: number | null; // 0..4
  lab_values: Record<string, LabValue>;
  prior_treatments: string[];
  geographic_constraint?: GeoConstraint | null;
}

export interface ClinicalNote {
  text: string;
  note_type: "progress" | "consult" | "discharge" | "other";
}

// ---- trial-side models (models/trial.py) -----------------------------------

export interface Criterion {
  criterion_type: CriterionType;
  category: CriterionCategory;
  operator: CriterionOperator;
  threshold?: string | number | null;
  source_text: string;
  field?: string | null;
}

// ---- match-result models (models/match.py) ---------------------------------

export interface CriterionVerdict {
  criterion: Criterion;
  verdict: Verdict;
  reasoning: string;
  confidence: number; // 0..1
  source_citation: string;
}

export interface TrialVerdict {
  nct_id: string;
  title: string;
  aggregate_verdict: AggregateVerdict;
  score: number; // 0..1
  criteria_verdicts: CriterionVerdict[];
  // NOTE: `insufficient_info_count` / `fail_count` are @property on the backend
  // model and are NOT serialized — compute them client-side (see verdictCounts).
}

export interface MatchReport {
  patient: PatientProfile;
  trial_verdicts: TrialVerdict[];
  summary: string;
  generated_at: string; // ISO datetime
  run_id?: string | null;
  disclaimer: string;
  // Extension (added by this project): per-run LLM telemetry, present only when
  // the Claude evaluator ran. Optional so JSON-only / rules runs still type-check.
  llm_stats?: LlmStats | null;
}

/**
 * Per-run Claude usage/cost/latency. Mirrors the structured fields the backend
 * evaluator logs in `_log_llm_call`. Optional across the app: absent on the
 * deterministic-rules path.
 */
export interface LlmStats {
  model: string;
  api_calls: number;
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
  latency_s: number;
}

// ---- SSE stream envelope (models/api.py) -----------------------------------

export type NodeStatus = "started" | "completed" | "failed";

export interface StateUpdateEvent {
  event: "state_update";
  node: string;
  status: NodeStatus;
  message?: string | null;
}

export interface ClarificationQuestion {
  criterion_id: string;
  source_text: string;
  question: string;
}

export interface ClarificationRequiredEvent {
  event: "clarification_required";
  run_id: string;
  questions: ClarificationQuestion[];
}

export interface FinalResultEvent {
  event: "final_result";
  report: MatchReport;
}

export interface ErrorEvent {
  event: "error";
  code: string;
  message: string;
}

export type StreamEvent =
  | StateUpdateEvent
  | ClarificationRequiredEvent
  | FinalResultEvent
  | ErrorEvent;

// ---- request payload (models/api.py) ---------------------------------------

export interface MatchOptions {
  max_results?: number;
  enable_clarification?: boolean;
}

export interface MatchRequest {
  input_mode: InputMode;
  patient?: PatientProfile;
  clinical_note?: ClinicalNote;
  options?: MatchOptions;
}

// ---- LangGraph nodes (graph.py) — ordered pipeline -------------------------

export const PIPELINE_NODES = [
  "profile_extractor",
  "trial_discovery",
  "eligibility_parser",
  "match_evaluator",
  "report_generator",
] as const;

export type PipelineNode = (typeof PIPELINE_NODES)[number];

export const NODE_LABELS: Record<PipelineNode, string> = {
  profile_extractor: "Profile intake",
  trial_discovery: "Trial discovery",
  eligibility_parser: "Eligibility parsing",
  match_evaluator: "Criterion evaluation",
  report_generator: "Verdict aggregation",
};

// ---- derived helpers -------------------------------------------------------

export interface VerdictCounts {
  PASS: number;
  FAIL: number;
  INSUFFICIENT_INFO: number;
}

/** Client-side recomputation of the backend's non-serialized count properties. */
export function verdictCounts(trial: TrialVerdict): VerdictCounts {
  const counts: VerdictCounts = { PASS: 0, FAIL: 0, INSUFFICIENT_INFO: 0 };
  for (const cv of trial.criteria_verdicts) counts[cv.verdict] += 1;
  return counts;
}

export function isPipelineNode(node: string): node is PipelineNode {
  return (PIPELINE_NODES as readonly string[]).includes(node);
}
