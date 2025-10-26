export interface RepoSummary {
  readme: string | null;
  latestCommitDaysAgo: number | null;
  ciStatus: 'passing' | 'failing' | 'none' | string;
  languages: Record<string, number>;
  manifestFiles: string[];
  hasTests: boolean;
  numContributors: number;
  isFork: boolean;
}

export interface Signals {
  hasLockfile: boolean;
  largeBinaryDetected: boolean;
  secretsDetected: boolean;
}

export interface MintEvidence {
  present: boolean;
  mintVerified?: boolean;
  chain?: 'alfajores' | 'celo' | null;
  tokenURI?: string | null;
  metadataStatus?: 'pinned' | 'resolvable' | 'missing' | 'mismatch' | null;
}

export interface LLMParsed {
  score: number;
  confidence: 'low' | 'medium' | 'high';
  explanation: string;
  reasons: string[];
  flags: string[];
}

export interface LLMResult {
  raw: string;
  parsed: LLMParsed;
}
