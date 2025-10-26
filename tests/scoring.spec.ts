import { deterministicScore } from '../src/services/scoring';

describe('deterministicScore', () => {
  it('calculates base with readme and tests and ci', () => {
    const signals = { hasLockfile: true, largeBinaryDetected: false };
    const github = { hasReadme: true, hasTests: true, ciStatus: 'passing' };
    const mint = { mintVerified: true, metadataStatus: 'pinned' };
    const score = deterministicScore(signals, github, {}, mint);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(10);
  });
});
