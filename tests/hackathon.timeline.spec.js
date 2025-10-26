"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const hackathonScraper_1 = require("../src/services/hackathonScraper");
const axios_1 = __importDefault(require("axios"));
jest.mock('axios');
const mockedAxios = axios_1.default;
describe('scrapeHackathonTimeline normalization', () => {
    beforeEach(() => {
        jest.resetAllMocks();
    });
    it('picks earliest start and latest end and collapses duplicate end checkpoints', async () => {
        const html = `
      <html>
        <body>
          <div>Kick-off: Aug 21, 2025</div>
          <div>Submission deadline: Oct 25, 2025</div>
          <div>Final showcase: Oct 26, 2025</div>
          <a href="https://github.com/owner/repo">repo</a>
        </body>
      </html>
    `;
        mockedAxios.get.mockResolvedValue({ status: 200, data: html });
        const tl = await (0, hackathonScraper_1.scrapeHackathonTimeline)('http://example.com');
        expect(tl.start).toBe('2025-08-21');
        expect(tl.end).toBe('2025-10-26');
        const endCheckpoints = tl.checkpoints.filter((c) => c.label === 'end');
        expect(endCheckpoints).toHaveLength(1);
        expect(endCheckpoints[0]?.date).toBe('2025-10-26');
    });
    it('swaps start/end if reversed due to noisy labels', async () => {
        const html = `
      <html>
        <body>
          <div>End: Aug 21, 2025</div>
          <div>Start: Oct 26, 2025</div>
        </body>
      </html>
    `;
        mockedAxios.get.mockResolvedValue({ status: 200, data: html });
        const tl = await (0, hackathonScraper_1.scrapeHackathonTimeline)('http://example.com');
        expect(tl.start).toBe('2025-08-21');
        expect(tl.end).toBe('2025-10-26');
    });
});
