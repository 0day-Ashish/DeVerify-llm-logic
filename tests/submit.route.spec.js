"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const supertest_1 = __importDefault(require("supertest"));
const express_1 = __importDefault(require("express"));
const submit_1 = __importDefault(require("../src/routes/submit"));
const submission_1 = require("../src/models/submission");
const bullmq_1 = require("bullmq");
jest.mock('../src/models/submission');
jest.mock('bullmq');
describe('POST /api/submit', () => {
    const app = (0, express_1.default)();
    app.use(express_1.default.json());
    app.use('/api/submit', submit_1.default);
    beforeEach(() => {
        submission_1.Submission.findOne = jest.fn().mockResolvedValue(null);
        submission_1.Submission.create = jest.fn().mockResolvedValue({ _id: 'abc' });
        bullmq_1.Queue.prototype.add = jest.fn().mockResolvedValue({});
    });
    it('returns 400 for invalid url', async () => {
        const res = await (0, supertest_1.default)(app).post('/api/submit').send({ repoUrl: 'https://gitlab.com/x/y' });
        expect(res.status).toBe(400);
    });
    it('creates submission and enqueues job', async () => {
        const res = await (0, supertest_1.default)(app).post('/api/submit').send({ repoUrl: 'https://github.com/owner/repo' });
        expect(res.status).toBe(201);
        expect(submission_1.Submission.create).toHaveBeenCalled();
    });
});
