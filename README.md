# Deverify Backend

Automated Evidence Verification & Scoring backend (Node.js + TypeScript + Express)

Quickstart

1. Copy .env.example -> .env and fill in values.
2. Install dependencies: npm install
3. Start Redis & MongoDB locally
4. Run server: npm run dev
5. Run worker in another terminal: npm run worker
6. Submit example:

curl -X POST http://localhost:4000/api/submit -H "Content-Type: application/json" -d '{"repoUrl":"https://github.com/owner/repo","demoUrl":"https://demo"}'

Run tests:

npm test

Notes
- Uses BullMQ (Redis) for job queueing and Mongoose for MongoDB models.
- LLM wrapper is swappable; default model is set via OPENAI_MODEL.
- IPFS pin and mint verification are optional (stubs with real client code).
