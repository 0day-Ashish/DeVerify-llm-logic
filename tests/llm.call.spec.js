"use strict";
// Mock OpenAI to throw once and then succeed
const createMock = jest
    .fn()
    .mockRejectedValueOnce(new Error('network'))
    .mockResolvedValueOnce({ choices: [{ message: { content: '{"score":5,"confidence":"medium","explanation":"x","reasons":[],"flags":[]}' } }] });
jest.mock('openai', () => {
    return jest.fn().mockImplementation(() => ({
        chat: { completions: { create: createMock } }
    }));
});
const { buildPrompt, callModel } = require('../src/services/llm');
const repo = {
    readme: 'Readme text',
    latestCommitDaysAgo: 5,
    ciStatus: 'passing',
    languages: { ts: 100 },
    manifestFiles: ['package.json'],
    hasTests: true,
    numContributors: 3,
    isFork: false
};
const sig = { hasLockfile: true, largeBinaryDetected: false, secretsDetected: false };
describe('callModel', () => {
    it('retries once on error and returns content', async () => {
        const { systemMessage, userMessage } = buildPrompt(repo, sig, { present: false });
        const text = await callModel([
            { role: 'system', content: systemMessage },
            { role: 'user', content: userMessage }
        ]);
        expect(text).toContain('"score"');
        // ensure retry happened
        expect(createMock).toHaveBeenCalledTimes(2);
        const firstCallArgs = createMock.mock.calls[0][0];
        expect(firstCallArgs.model).toBe(process.env.OPENAI_MODEL || 'gpt-5-thinking-mini');
        expect(firstCallArgs.temperature).toBe(0.0);
    });
});
