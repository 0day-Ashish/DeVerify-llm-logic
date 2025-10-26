// Mock deterministic score for fallback (must be before requiring llm)
jest.mock('../src/services/scoring', () => ({ deterministicScore: () => 7 }));

// Prepare a controlled OpenAI mock that returns specific contents in sequence
const validJson = '{"score":8,"confidence":"high","explanation":"Looks good","reasons":["tests","ci"],"flags":[]}';

let callIndex = 0;
jest.mock('openai', () => {
  const create = jest.fn().mockImplementation(() => {
    callIndex++;
    // 1: valid json for first test
    if (callIndex === 1) return { choices: [{ message: { content: validJson } }] };
    // 2: malformed then 3: valid for retry test
    if (callIndex === 2) return { choices: [{ message: { content: 'I think this is fine...' } }] };
    if (callIndex === 3) return { choices: [{ message: { content: validJson } }] };
    // 4+: always malformed to force fallback
    return { choices: [{ message: { content: 'not json' } }] };
  });
  const OpenAI = jest.fn().mockImplementation(() => ({
    chat: { completions: { create } }
  }));
  return OpenAI;
});

const { scoreRepo, parseAndValidate } = require('../src/services/llm');

const baseRepo = {
  readme: 'Hello',
  latestCommitDaysAgo: 2,
  ciStatus: 'passing',
  languages: { ts: 100 },
  manifestFiles: ['package.json'],
  hasTests: true,
  numContributors: 2,
  isFork: false
};

const baseSignals = {
  hasLockfile: true,
  largeBinaryDetected: false,
  secretsDetected: false
};

describe('llm.parse and fallback', () => {
  it('parseAndValidate parses valid JSON', () => {
    const parsed = parseAndValidate(validJson);
    expect(parsed.score).toBe(8);
    expect(parsed.confidence).toBe('high');
  });

  it('scoreRepo retries on malformed then succeeds', async () => {
    // Force first model call to be malformed and second to be valid
    callIndex = 1; // next create() -> callIndex=2 => malformed; then 3 => valid
    const res = await scoreRepo(baseRepo as any, baseSignals as any, { present: false });
    expect(res.parsed.score).toBe(8);
  });

  it('scoreRepo returns deterministic fallback after two malformed responses', async () => {
    // Force subsequent mock calls to return malformed content
    // Ensure subsequent calls are always malformed
    callIndex = 100; 
    const out = await scoreRepo(baseRepo as any, baseSignals as any, { present: false });
    expect(out.parsed.flags).toContain('llm_parse_error');
    expect(out.parsed.confidence).toBe('low');
    expect(out.parsed.score).toBe(7);
  });
});
