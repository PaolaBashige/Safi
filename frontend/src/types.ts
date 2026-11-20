export type RiskLevel = 'HIGH RISK' | 'SUSPICIOUS' | 'LOW RISK' | 'UNABLE TO ASSESS';
export type InputType = 'message' | 'url' | 'screenshot';

export interface Analysis {
  riskLevel: RiskLevel;
  threatType: string;
  summary: string;
  whyRisky: string[];
  indicators: string[];
  recommendedActions: string[];
  educationalTopic: string;
  confidence: 'low' | 'medium' | 'high';
  assessmentMode: 'mock' | 'ai';
  urlSignals: string[];
  disclaimer: string;
}

export interface AnalyzeRequest {
  inputType: InputType;
  content: string;
  metadata?: { mimeType?: string };
}

export type Route = 'analyze' | 'learn' | 'practice' | 'about';
