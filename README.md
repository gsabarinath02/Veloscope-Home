# Eventforce AI Assistant Demo

A client-ready Veloscope/Eventforce-style website with a real OpenAI-backed Velo assistant, local marathon document retrieval, Tavily web search, Deepgram voice transcription, Deepgram text-to-speech voice replies, voice-guided registration, QR generation, and automatic support ticket creation for questions the assistant cannot answer.

## Run

```bash
npm install
npm run dev
```

Open `http://127.0.0.1:5173`.

## API Keys

Create `.env.local` in this folder. Keys stay server-side and are never exposed to the browser.

```bash
OPENAI_API_KEY=sk-proj-your-key-here
OPENAI_MODEL=gpt-4.1-mini
TAVILY_API_KEY=tvly-your-key-here
DEEPGRAM_API_KEY=deepgram-your-key-here
npm run dev
```

The assistant retrieves context from `server/data/docs`, optionally adds Tavily web search results, then asks OpenAI to answer or escalate. If escalation is needed, it creates a ticket and returns the ticket number.

## Docker

Build and run the production container locally:

```bash
docker build -t eventforce-ai-assistant-demo .
docker run --rm -p 8080:8080 \
  -e OPENAI_API_KEY=sk-proj-your-key-here \
  -e OPENAI_MODEL=gpt-4.1-mini \
  -e TAVILY_API_KEY=tvly-your-key-here \
  -e DEEPGRAM_API_KEY=deepgram-your-key-here \
  eventforce-ai-assistant-demo
```

Open `http://127.0.0.1:8080`.

The image runs `npm run start`, serves the built Vite app from `dist`, and exposes `/api/health` for platform health checks.

## Railway Deployment

This repo includes `Dockerfile`, `.dockerignore`, and `railway.toml`, so Railway will build it as a Docker service.

Set these Railway service variables:

```bash
OPENAI_API_KEY=sk-proj-your-key-here
OPENAI_MODEL=gpt-4.1-mini
TAVILY_API_KEY=tvly-your-key-here
DEEPGRAM_API_KEY=deepgram-your-key-here
NODE_ENV=production
```

Railway provides `PORT` automatically. Do not upload `.env.local`; it is ignored by Docker.

Optional: if you attach a Railway volume and want tickets/registrations to survive redeploys, set:

```bash
DEMO_DATA_DIR=/data
```

## Demo Flows

- Document Q&A: event date, race categories, fees, refunds, bib collection, timing chip, medical support, parking, organizer details, and cut-off times.
- Web Q&A: upcoming marathons, weather, running trends, hydration practices, and recent safety guidance.
- Voice: push-to-talk sends audio to Deepgram Speech-to-Text. Voice replies use Deepgram TTS through `/api/speak`, with browser speech synthesis as a fallback. Browser wake-word support is attempted through Web Speech APIs and falls back to push-to-talk when unavailable.
- Registration: Velo asks for runner details, fills the form live, stores a mock registration, and generates a QR code.
