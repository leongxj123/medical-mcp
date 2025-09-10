export type DrugLabel = {
  openfda: {
    brand_name?: string[];
    generic_name?: string[];
    manufacturer_name?: string[];
    product_ndc?: string[];
    substance_name?: string[];
    route?: string[];
    dosage_form?: string[];
  };
  purpose?: string[];
  warnings?: string[];
  adverse_reactions?: string[];
  drug_interactions?: string[];
  dosage_and_administration?: string[];
  clinical_pharmacology?: string[];
  effective_time: string;
};

export type WHOIndicator = {
  IndicatorCode: string;
  IndicatorName: string;
  SpatialDimType: string;
  SpatialDim: string;
  TimeDim: string;
  TimeDimType: string;
  DataSourceDim: string;
  DataSourceType: string;
  Value: number;
  NumericValue: number;
  Low: number;
  High: number;
  Comments: string;
  Date: string;
};

export type RxNormDrug = {
  rxcui: string;
  name: string;
  synonym: string[];
  tty: string;
  language: string;
  suppress: string;
  umlscui: string[];
};

export type PubMedArticle = {
  pmid: string;
  title: string;
  abstract: string;
  authors: string[];
  journal: string;
  publication_date: string;
  doi?: string;
};

export type GoogleScholarArticle = {
  title: string;
  authors?: string;
  abstract?: string;
  journal?: string;
  year?: string;
  citations?: string;
  url?: string;
  pdf_url?: string;
  related_articles?: string[];
};

export type ClinicalGuideline = {
  title: string;
  organization: string;
  year: string;
  url: string;
  description?: string;
  category?: string;
  evidence_level?: string;
};

// Drug Safety Types
export type DrugSafetyInfo = {
  drug_name: string;
  pregnancy_category?: string; // A, B, C, D, X, or N (not classified)
  lactation_safety?: string; // Safe, Caution, Avoid, or Unknown
  contraindications?: string[];
  warnings?: string[];
  monitoring_requirements?: string[];
  alternative_drugs?: string[];
  last_updated: string;
};

export type DrugInteraction = {
  drug1: string;
  drug2: string;
  severity: "Minor" | "Moderate" | "Major" | "Contraindicated";
  description: string;
  clinical_effects: string;
  management: string;
  evidence_level: string;
};

// Diagnostic Support Types
export type DifferentialDiagnosis = {
  symptoms: string[];
  possible_diagnoses: {
    diagnosis: string;
    probability: "Low" | "Moderate" | "High";
    key_findings: string[];
    next_steps: string[];
  }[];
  red_flags: string[];
  urgent_considerations: string[];
};

export type RiskCalculator = {
  name: string;
  description: string;
  parameters: {
    name: string;
    type: "number" | "boolean" | "select";
    options?: string[];
    required: boolean;
  }[];
  calculation: string;
  interpretation: {
    low_risk: string;
    moderate_risk: string;
    high_risk: string;
  };
  references: string[];
};

export type LabValue = {
  test_name: string;
  normal_ranges: {
    age_group: string;
    pregnancy_status?: string;
    male_range?: string;
    female_range?: string;
    units: string;
  }[];
  critical_values: {
    low: string;
    high: string;
  };
  interpretation: string;
  clinical_significance: string;
};

export type DiagnosticCriteria = {
  condition: string;
  criteria_sets: {
    name: string;
    source: string;
    criteria: {
      category: string;
      items: string[];
      required_count?: number;
    }[];
  }[];
  differential_diagnosis: string[];
  red_flags: string[];
};
