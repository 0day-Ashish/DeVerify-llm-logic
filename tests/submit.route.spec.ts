import request from 'supertest';
import express from 'express';
import submitRoute from '../src/routes/submit';
import { Submission } from '../src/models/submission';
import { Queue } from 'bullmq';

jest.mock('../src/models/submission');
jest.mock('bullmq');

describe('POST /api/submit', () => {
  const app = express();
  app.use(express.json());
  app.use('/api/submit', submitRoute);

  beforeEach(() => {
    (Submission as any).findOne = jest.fn().mockResolvedValue(null);
    (Submission as any).create = jest.fn().mockResolvedValue({ _id: 'abc' });
    (Queue as any).prototype.add = jest.fn().mockResolvedValue({});
  });

  it('returns 400 for invalid url', async () => {
    const res = await request(app).post('/api/submit').send({ repoUrl: 'https://gitlab.com/x/y' });
    expect(res.status).toBe(400);
  });

  it('creates submission and enqueues job', async () => {
    const res = await request(app).post('/api/submit').send({ repoUrl: 'https://github.com/owner/repo' });
    expect(res.status).toBe(201);
    expect((Submission as any).create).toHaveBeenCalled();
  });
});
