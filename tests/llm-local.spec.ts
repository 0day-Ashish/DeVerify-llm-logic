// Mock OpenAI before importing the module under test
jest.mock('openai', () => {
  const create = jest.fn().mockResolvedValue({ choices: [{ message: { content: 'hello-local' } }] });
  const OpenAI = function (opts: any) {
    expect(opts.baseURL).toBe(process.env.LLM_BASE_URL || 'http://localhost:11434/v1');
    expect(opts.apiKey).toBe(process.env.LLM_API_KEY || 'ollama');
    return { chat: { completions: { create } } } as any;
  } as unknown as jest.Mock;
  (OpenAI as any).__create = create;
  return OpenAI;
});

describe('llm-local callLocalModel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.LLM_BASE_URL = 'http://localhost:11434/v1';
    process.env.LLM_API_KEY = 'ollama';
    process.env.LLM_MODEL = 'mistral';
  });

  it('calls local baseURL and returns content', async () => {
    const { callLocalModel } = require('../src/services/llm-local');
    const out = await callLocalModel([
      { role: 'system', content: 'sys' },
      { role: 'user', content: 'hi' }
    ]);
    expect(out).toBe('hello-local');
    const OpenAI = require('openai');
    const createMock = (OpenAI as any).__create as jest.Mock;
    expect(createMock).toHaveBeenCalledTimes(1);
    const args = createMock.mock.calls[0][0];
    expect(args.model).toBe('mistral');
    expect(args.temperature).toBe(0.0);
    expect(Array.isArray(args.messages)).toBe(true);
  });
});
