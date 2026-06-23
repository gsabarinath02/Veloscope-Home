import express from "express";
import { createServer as createViteServer } from "vite";
import { isDeepgramConfigured, isOpenAIConfigured } from "./env.js";
import { answerWithOpenAI } from "./assistant.js";
import { transcribeAudio } from "./deepgram.js";
import { createRegistration } from "./registrations.js";
import { createTicket } from "./tickets.js";
import { isTavilyConfigured, searchWithTavily } from "./tavily.js";
import { retrieveAnswer, retrieveContext, shouldPreferTicket, shouldSearchWeb } from "./rag.js";

const app = express();
const port = Number(process.env.PORT || 5173);
const isProduction = process.env.NODE_ENV === "production";
const host = process.env.HOST || (isProduction ? "0.0.0.0" : "127.0.0.1");

app.use(express.json({ limit: "1mb" }));

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    service: "eventforce-ai-assistant-demo",
    environment: isProduction ? "production" : "development"
  });
});

app.get("/api/config", (_req, res) => {
  res.json({
    deepgramConfigured: isDeepgramConfigured(),
    tavilyConfigured: isTavilyConfigured(),
    openaiConfigured: isOpenAIConfigured()
  });
});

app.post("/api/transcribe", express.raw({ type: "*/*", limit: "25mb" }), async (req, res) => {
  try {
    if (!req.body?.length) {
      return res.status(400).json({ error: "Audio payload is required" });
    }

    const result = await transcribeAudio({
      audio: req.body,
      contentType: req.headers["content-type"]
    });

    if (!result.configured) {
      return res.status(503).json(result);
    }

    return res.json(result);
  } catch (error) {
    console.error("Deepgram request failed", {
      message: error?.message,
      name: error?.name
    });
    return res.status(500).json({
      error: "Transcription failed",
      transcript: ""
    });
  }
});

app.post("/api/registrations", async (req, res) => {
  const details = req.body?.details;
  if (!details?.fullName || !details?.phone || !details?.email || !details?.raceCategory) {
    return res.status(400).json({ error: "Missing required registration details" });
  }

  const registration = await createRegistration(details);
  return res.json(registration);
});

app.post("/api/chat", async (req, res) => {
  const message = String(req.body?.message || "").trim();
  const useWeb = Boolean(req.body?.useWeb);
  let webAllowed = false;
  let webUsed = false;
  let rag;
  let web = null;

  if (!message) {
    return res.status(400).json({ error: "Message is required" });
  }

  try {
    rag = retrieveContext(message);
    const forceTicket = shouldPreferTicket(message);
    webAllowed = useWeb && !forceTicket && (!rag.confident || shouldSearchWeb(message));

    if (webAllowed && isTavilyConfigured()) {
      web = await searchWithTavily(message);
      webUsed = Boolean(web);
    }

    const aiResult = await answerWithOpenAI({
      message,
      rag,
      web,
      forceTicket
    });

    const sources = [...rag.sources, ...(web?.sources || [])].filter((source, index, all) => {
      const key = source.url || source.title;
      return index === all.findIndex((item) => (item.url || item.title) === key);
    });

    if (!aiResult.needsTicket) {
      return res.json({
        mode: aiResult.mode,
        answer: aiResult.answer,
        sources,
        webSearchAttempted: webAllowed,
        webSearchUsed: Boolean(web),
        webSearchConfigured: isTavilyConfigured()
      });
    }

    const ticket = await createTicket({
      question: message,
      reason:
        aiResult.ticketReason ||
        (webAllowed && !isTavilyConfigured() ? "web_search_not_configured" : "no_confident_answer")
    });

    return res.json({
      mode: "ticket",
      answer: aiResult.answer || "I created a support ticket so the event team can follow up.",
      ticketNumber: ticket.id,
      sources,
      webSearchAttempted: webAllowed,
      webSearchUsed: Boolean(web),
      webSearchConfigured: isTavilyConfigured()
    });
  } catch (error) {
    const errorInfo = {
      name: error?.name,
      status: error?.status,
      code: error?.code,
      type: error?.type,
      message: error?.message
    };
    console.error("Assistant request failed", errorInfo);

    const isQuotaError = error?.code === "insufficient_quota" || error?.status === 429;

    if (isQuotaError && web?.answer) {
      return res.status(200).json({
        mode: "web",
        answer: web.answer,
        sources: [...(rag?.sources || []), ...(web.sources || [])],
        webSearchAttempted: webAllowed,
        webSearchUsed: true,
        webSearchConfigured: isTavilyConfigured(),
        providerWarning: "OpenAI quota is not available, so this answer is shown directly from Tavily web search results."
      });
    }

    if (isQuotaError && rag?.confident) {
      const fallback = retrieveAnswer(message);
      return res.status(200).json({
        mode: "rag",
        answer: fallback.answer,
        sources: fallback.sources,
        webSearchAttempted: webAllowed,
        webSearchUsed: false,
        webSearchConfigured: isTavilyConfigured(),
        providerWarning: "OpenAI quota is not available, so this answer is shown directly from retrieved event documents."
      });
    }

    const ticket = await createTicket({
      question: message,
      reason: isQuotaError ? "openai_insufficient_quota" : "assistant_error"
    });

    return res.status(200).json({
      mode: "ticket",
      answer: isQuotaError
        ? "OpenAI is connected, but this API project does not have usable quota right now. I created a support ticket so the team can follow up."
        : "The assistant hit an internal issue, so I created a support ticket for the team to review.",
      ticketNumber: ticket.id,
      sources: [],
      webSearchAttempted: webAllowed,
      webSearchUsed: webUsed,
      webSearchConfigured: isTavilyConfigured()
    });
  }
});

if (isProduction) {
  app.use(express.static("dist"));
  app.get(/.*/, (_req, res) => {
    res.sendFile("index.html", { root: "dist" });
  });
} else {
  const vite = await createViteServer({
    server: { middlewareMode: true },
    appType: "spa"
  });
  app.use(vite.middlewares);
}

app.listen(port, host, () => {
  console.log(`Eventforce AI Assistant demo running at http://${host}:${port}`);
});
