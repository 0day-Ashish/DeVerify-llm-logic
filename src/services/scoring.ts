import { LLMResp } from '../validators/llmSchema';

export function deterministicScore(signals: any, github: any, dynamicChecks: any, mintEvidence: any) {
  let score = 5;
  // README-based heuristics
  if (github?.hasReadme) score += 0.5;
  const r = github?.readmeInfo;
  if (r) {
    // reward richer READMEs
    if (r.length >= 1000) score += 1;
    else if (r.length >= 400) score += 0.5;
    if (r.headingCount >= 5) score += 0.5;
    if (r.hasInstall) score += 0.5;
    if (r.hasUsage) score += 0.5;
    if (r.hasDemo) score += 0.25;
    if (r.hasScreenshot) score += 0.25;
    // penalize boilerplate or extremely minimal READMEs
    if (r.minimal) score -= 1;
    if (r.boilerplateScore) score += r.boilerplateScore; // negative value reduces score
  }
  if (github?.hasTests) score += 1.5;
  if (github?.ciStatus === 'passing') score += 1;
  if (signals?.hasLockfile) score += 0.5;
  if (signals?.largeBinaryDetected) score -= 2;
  if (mintEvidence?.mintVerified === true) score += 2;
  if (mintEvidence?.metadataStatus === 'pinned') score += 0.5;
  if (score < 0) score = 0;
  if (score > 10) score = 10;
  return Number(score.toFixed(2));
}

export function combineScores(llm: LLMResp, det: number) {
  const finalScore = Math.round(((llm.score * 0.6) + (det * 0.4)) * 10) / 10;
  return finalScore;
}

export default { deterministicScore, combineScores };
