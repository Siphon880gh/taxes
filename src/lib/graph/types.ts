export type TaxYear = 2024 | 2025 | 2026;

export type Certainty = "sourced" | "verify";

export type Citation = {
  title: string;
  url: string;
  /** Tax year, pricing year, or survey year the figure belongs to. */
  yearLabel: string;
  citation: string;
};

export type NodeKind = "question" | "check";

export type SectionId =
  | "start"
  | "income"
  | "se"
  | "payments"
  | "rental"
  | "invest"
  | "other"
  | "deductions"
  | "flow";

export type Answer = {
  id: string;
  label: string;
  /** Short label drawn on the edge. */
  edge?: string;
  next: string[];
};

export type GraphNode = {
  id: string;
  section: SectionId;
  kind: NodeKind;
  title: string;
  /** Default Mermaid label. Session-specific labels can replace this. */
  chart: string;
  prompt?: string;
  help?: string;
  answers?: Answer[];
  textInput?: {
    placeholder: string;
    answerId: string;
    next: string[];
    edge?: string;
  };
  tipId?: string;
  /** Drawn when both this node and the target are revealed. */
  flowsTo?: string[];
};

export type StoredAnswer = {
  answerId: string;
  text?: string;
};

export type Session = {
  answers: Record<string, StoredAnswer>;
  revealed: string[];
  quote: number | null;
  caseStudyId: string | null;
};

export type ChecklistItem = {
  id: string;
  form: string;
  schedule?: string;
  line?: string;
  summary: string;
  certainty: Certainty;
  source?: Citation;
};

export type TipContext = {
  year: TaxYear | null;
  quote: number | null;
  caseStudyId: string | null;
};

export type TipBody = {
  title: string;
  paragraphs: string[];
  bullets?: string[];
  citations: Citation[];
};

export type Tip = {
  id: string;
  toast: string;
  readMore?: (ctx: TipContext) => TipBody;
};

export type CaseStudy = {
  id: string;
  title: string;
  summary: string;
  quote: number | null;
  answers: Record<string, StoredAnswer>;
};
