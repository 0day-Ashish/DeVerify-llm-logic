# Local LLM (Ollama) Setup

Use a local Ollama server with an OpenAI-compatible API to score repos without calling external providers.

## Install Ollama
- Windows: https://ollama.com/download
- After installation, open a terminal and pull a model:

```powershell
ollama pull mistral
```

Run Ollama (detached):

```powershell
ollama run mistral --detach
```

## Configure backend

Create a local env file from the main example and run the backend:

```powershell
cp .env.example .env
npm run dev
```

Enable local LLM in `.env` and set values like:

```
USE_LOCAL_LLM=true
LLM_BASE_URL=http://localhost:11434/v1
LLM_MODEL=mistral
LLM_API_KEY=ollama
LLM_TIMEOUT_MS=15000
```

The backend will automatically route LLM calls to the local OpenAI-compatible endpoint when `USE_LOCAL_LLM=true`.

## Quick curl test (optional)

Verify your Ollama server is serving OpenAI-compatible chat completions:

```powershell
curl -s -X POST "http://localhost:11434/v1/chat/completions" \
  -H "Content-Type: application/json" \
  -d '{"model":"mistral","messages":[{"role":"user","content":"hello local"}]}'
```

You should see a JSON response with `choices[0].message.content`.
