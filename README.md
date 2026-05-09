# Conversational Form

This project implements a conversational AI-driven form generator. The backend manages LLM interactions, validates JSON Schemas (Draft-07), and maintains conversation state. The frontend is a React app that provides a chat interface and a live form renderer.

## Quick start (local)

1. Start the backend:

```bash
cd backend
npm install
npm start
```

The frontend listens on port `3000` by default (configured in `frontend/vite.config.js` and `frontend/Dockerfile`).

## Docker (one-command)

Ensure you have Docker and Docker Compose installed. `docker-compose.yml` is configured to start both services.

```bash
docker-compose up --build
```

The frontend will be accessible at http://localhost:3000 and the backend at http://localhost:8080.

Notes:
- `backend/.env.example` documents required env vars; `backend/.env` is provided for convenience.
- The backend enables CORS to allow the frontend dev server to call the API during development.
- Fixed a bug in the backend where a null schema during LLM failure would cause a crash.
- Fixed the error response message for exhausted retries to match requirement specifications.
- Aligned frontend Dockerfile ports with Vite configuration.

## Contracts implemented

- `GET /health` — returns `{ "status": "healthy" }`.
- `POST /api/form/generate` — accepts `{ prompt, conversationId? }` and returns `{ conversationId, formId, version, schema }` on success or `{ status: 'clarification_needed', conversationId, questions }` when ambiguous.
- The backend validates generated schemas against JSON Schema Draft-07 via `ajv` and retries generation up to 3 attempts when validation fails. Use `?mock_llm_failure=N` to simulate invalid LLM outputs for testing.

## Frontend features

- Split-pane layout with `data-testid="chat-pane"` and `data-testid="form-renderer-pane"`.
- Live form rendering from JSON Schema, including support for `x-show-when` conditional field visibility.
- Schema diff panel (`data-testid="schema-diff-panel"`) and export panel (`data-testid="export-panel"`) with buttons:
  - `data-testid="export-json-button"`
  - `data-testid="copy-code-button"`
  - `data-testid="copy-curl-button"`

## Design notes

- The backend currently synthesizes schemas programmatically for predictable tests. Replace the synthesizer with a real LLM integration for production.
- Conversation state is stored in-memory (`Map`) for simplicity.
- The frontend renderer is a minimal implementation focused on the required behavior and testids.

## Next steps

- Integrate a real LLM provider and add prompt engineering with few-shot examples.
- Replace the minimal renderer with `@rjsf/core` for advanced rendering and validation features.
- Persist conversation state (e.g., Redis) for production deployments.
