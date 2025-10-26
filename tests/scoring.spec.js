"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const scoring_1 = require("../src/services/scoring");
describe('deterministicScore', () => {
    it('calculates base with readme and tests and ci', () => {
        const signals = { hasLockfile: true, largeBinaryDetected: false };
        const github = { hasReadme: true, hasTests: true, ciStatus: 'passing' };
        const mint = { mintVerified: true, metadataStatus: 'pinned' };
        const score = (0, scoring_1.deterministicScore)(signals, github, {}, mint);
        expect(score).toBeGreaterThanOrEqual(0);
        expect(score).toBeLessThanOrEqual(10);
    });
});
