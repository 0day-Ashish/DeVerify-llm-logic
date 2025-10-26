# LLM Scoring Module

This module provides `scoreRepo(repoSummary, signals, mintEvidence)` to score a GitHub submission using an OpenAI-style chat API with strict JSON output, Zod validation, retry logic, and a deterministic fallback.

## Usage

```ts
import { scoreRepo } from './src/services/llm';

const repoSummary = {
  readme: '...',
  latestCommitDaysAgo: 2,
  ciStatus: 'passing',
  languages: { typescript: 1234 },
  manifestFiles: ['package.json','README.md'],
  hasTests: true,
  numContributors: 3,
  isFork: false
};

const signals = {
  hasLockfile: true,
  largeBinaryDetected: false,
  secretsDetected: false
};

const mintEvidence = { present: false };

const result = await scoreRepo(repoSummary, signals, mintEvidence);
console.log(result.parsed.score, result.parsed.explanation);
```

In a worker, you would do something like:

```ts
import { scoreRepo } from '../services/llm';
// ... load repoSummary and signals
const llmResult = await scoreRepo(repoSummary, signals, mintEvidence);
// persist llmResult.raw and llmResult.parsed
```

## Environment

Set these environment variables:

- `OPENAI_API_KEY` — API key for OpenAI compatible API
- `OPENAI_MODEL` — defaults to `gpt-5-thinking-mini`
- `OPENAI_TIMEOUT_MS` — optional timeout in ms (default 15000)
- `OPENAI_BASE_URL` — set to `http://localhost:11434/v1` for Ollama (OpenAI-compatible API)

### Using Ollama locally

This module can talk to any OpenAI-compatible server. To use Ollama:

1. Install and start Ollama locally.
2. Run an OpenAI-compatible bridge (Ollama >=0.3 provides a /v1 API) and set:

```
OPENAI_BASE_URL=http://localhost:11434/v1
OPENAI_MODEL=llama3.1:8b-instruct
OPENAI_API_KEY=ollama   # placeholder; client requires a string
```

With these env vars, the same code path will call your local Ollama model.

If using the official client:

```ts
import OpenAI from 'openai';
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
```

### Using Ollama locally

1. Start Ollama and pull a model, e.g.: `ollama pull llama3.1:8b-instruct`
2. Set env:
  - `OPENAI_BASE_URL=http://localhost:11434/v1`
  - `OPENAI_MODEL=llama3.1:8b-instruct` (or your chosen model tag)
  - `OPENAI_API_KEY=ollama` (placeholder; Ollama doesn’t require a key)
3. Run your server/worker. The module will send OpenAI-format requests to Ollama’s endpoint.

## Notes
- Module builds a prompt with two few-shot examples and a strict system instruction.
- It validates model output with Zod. If parsing fails, it retries once with a stricter instruction. If still failing, it returns a deterministic fallback using `deterministicScore`.
- `logger.debug` captures prompt and raw response previews in non-production environments (without logging secrets).
- TODOs in code mark where to add metrics, logging enrichment, or rate limiting in production.
