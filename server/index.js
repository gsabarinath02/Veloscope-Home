import express from "express";
import { createServer as createViteServer } from "vite";
import { isDeepgramConfigured, isOpenAIConfigured } from "./env.js";
import { answerWithOpenAI, getCurrentDateContext } from "./assistant.js";
import { synthesizeSpeech, transcribeAudio } from "./deepgram.js";
import { createRegistration } from "./registrations.js";
import { createTicket } from "./tickets.js";
import { isTavilyConfigured, searchWithTavily } from "./tavily.js";
import { retrieveAnswer, retrieveContext, shouldPreferTicket, shouldSearchWeb } from "./rag.js";

const app = express();
const port = Number(process.env.PORT || 5173);
const isProduction = process.env.NODE_ENV === "production";
const host = process.env.HOST || (isProduction ? "0.0.0.0" : "127.0.0.1");

app.use(express.json({ limit: "1mb" }));

function normalizeSourceTitle(value = "") {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function filterCitedSources(sources, citedSourceTitles = []) {
  const cited = citedSourceTitles.map(normalizeSourceTitle).filter(Boolean);
  if (!cited.length) return sources;

  const filtered = sources.filter((source) => {
    const title = normalizeSourceTitle(source.title || source.url);
    return cited.some((citedTitle) => title.includes(citedTitle) || citedTitle.includes(title));
  });

  return filtered.length ? filtered : sources;
}

function shouldUseLocalDocumentContext(message) {
  const lower = message.toLowerCase();
  return [
    "kochi",
    "eventforce",
    "veloscope",
    "velo",
    "bib",
    "registration",
    "refund",
    "timing chip",
    "race day",
    "venue",
    "parking",
    "cut-off",
    "cutoff",
    "medical",
    "route",
    "organizer",
    "t-shirt",
    "tshirt",
    "fee",
    "category",
    "categories"
  ].some((term) => lower.includes(term));
}

const monthLookup = {
  january: 0,
  february: 1,
  march: 2,
  april: 3,
  may: 4,
  june: 5,
  july: 6,
  august: 7,
  september: 8,
  october: 9,
  november: 10,
  december: 11
};

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function dateTimestamp({ day, month, year }) {
  const monthIndex = monthLookup[String(month).toLowerCase()];
  if (monthIndex === undefined) return null;

  return Date.UTC(Number(year), monthIndex, Number(day));
}

function currentDateTimestamp(dateString) {
  const [year, month, day] = dateString.split("-").map(Number);
  return Date.UTC(year, month - 1, day);
}

function extractAnswerDates(answer) {
  const dates = [];
  const dayMonthYear =
    /\b(\d{1,2})(?:st|nd|rd|th)?\s+(January|February|March|April|May|June|July|August|September|October|November|December),?\s+(20\d{2})\b/gi;
  const monthDayYear =
    /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(20\d{2})\b/gi;

  for (const match of answer.matchAll(dayMonthYear)) {
    dates.push({
      text: match[0],
      timestamp: dateTimestamp({ day: match[1], month: match[2], year: match[3] })
    });
  }

  for (const match of answer.matchAll(monthDayYear)) {
    dates.push({
      text: match[0],
      timestamp: dateTimestamp({ day: match[2], month: match[1], year: match[3] })
    });
  }

  return dates.filter((date) => date.timestamp !== null);
}

function isFutureSeekingQuestion(message) {
  return /\b(next|upcoming|future|later|remaining)\b/i.test(message);
}

function mentionsNoFutureDate(answer) {
  return /\b(not announced|not found|not available|not listed|no information|no announced(?: or found)? date|announced or found|could not find|unable to find|no reliable future)\b/i.test(
    answer
  );
}

function normalizeTemporalAnswer({ answer, message, currentDate }) {
  if (!answer || !isFutureSeekingQuestion(message)) return answer;

  const dates = extractAnswerDates(answer);
  const today = currentDateTimestamp(currentDate.date);
  const pastDates = dates.filter((date) => date.timestamp < today);
  const futureDates = dates.filter((date) => date.timestamp > today);
  if (!pastDates.length || futureDates.length) return answer;

  let normalized = answer;
  for (const date of pastDates) {
    const datePattern = escapeRegExp(date.text);
    const replacements = [
      [new RegExp(`\\bis\\s+scheduled\\s+to\\s+be\\s+held\\s+on\\s+${datePattern}`, "gi"), `was listed for ${date.text}`],
      [new RegExp(`\\bis\\s+scheduled\\s+for\\s+${datePattern}`, "gi"), `was listed for ${date.text}`],
      [new RegExp(`\\bis\\s+set\\s+for\\s+${datePattern}`, "gi"), `was listed for ${date.text}`],
      [new RegExp(`\\bis\\s+planned\\s+for\\s+${datePattern}`, "gi"), `was listed for ${date.text}`],
      [new RegExp(`\\bis\\s+on\\s+${datePattern}`, "gi"), `was listed for ${date.text}`],
      [new RegExp(`\\bwill\\s+be\\s+held\\s+on\\s+${datePattern}`, "gi"), `was listed for ${date.text}`],
      [new RegExp(`\\bwill\\s+take\\s+place\\s+on\\s+${datePattern}`, "gi"), `was listed for ${date.text}`]
    ];

    for (const [pattern, replacement] of replacements) {
      normalized = normalized.replace(pattern, replacement);
    }

    normalized = normalized.replace(
      new RegExp(`\\bThe\\s+next\\s+([^.]{1,120}?)\\s+was\\s+listed\\s+for\\s+${datePattern}`, "gi"),
      `The most recent listed $1 was ${date.text}`
    );
  }

  normalized = normalized.replace(
    /\b(The\s+(?:date I found|most recent listed date)[^.]{0,140}?)\s+was\s+listed\s+for\s+/gi,
    "$1 was "
  );

  if (!mentionsNoFutureDate(normalized)) {
    normalized = `${normalized} As of ${currentDate.displayDate}, I could not find an announced next date in the browsed sources.`;
  }

  return normalized;
}

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

app.post("/api/speak", async (req, res) => {
  try {
    const text = String(req.body?.text || "").trim();
    if (!text) {
      return res.status(400).json({ error: "Text is required" });
    }

    const result = await synthesizeSpeech({ text });
    if (!result.configured) {
      return res.status(503).json(result);
    }

    if (!result.audio) {
      return res.status(400).json({ error: result.error || "Speech audio was not generated" });
    }

    res.setHeader("Content-Type", result.contentType);
    res.setHeader("Cache-Control", "no-store");
    return res.send(result.audio);
  } catch (error) {
    console.error("Deepgram TTS request failed", {
      message: error?.message,
      name: error?.name
    });
    return res.status(500).json({
      error: "Speech synthesis failed"
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
  let answerRag;
  let web = null;

  if (!message) {
    return res.status(400).json({ error: "Message is required" });
  }

  try {
    rag = retrieveContext(message);
    const forceTicket = shouldPreferTicket(message);
    webAllowed = useWeb && !forceTicket && (!rag.confident || shouldSearchWeb(message));
    answerRag = webAllowed && !shouldUseLocalDocumentContext(message)
      ? { confident: false, score: 0, chunks: [], sources: [] }
      : rag;

    if (webAllowed && isTavilyConfigured()) {
      web = await searchWithTavily(message);
      webUsed = Boolean(web);
    }

    const aiResult = await answerWithOpenAI({
      message,
      rag: answerRag,
      web,
      forceTicket
    });
    const answer = normalizeTemporalAnswer({
      answer: aiResult.answer,
      message,
      currentDate: getCurrentDateContext()
    });

    const sources = [...answerRag.sources, ...(web?.sources || [])].filter((source, index, all) => {
      const key = source.url || source.title;
      return index === all.findIndex((item) => (item.url || item.title) === key);
    });
    const citedSources = filterCitedSources(sources, aiResult.citedSourceTitles);

    if (!aiResult.needsTicket) {
      return res.json({
        mode: aiResult.mode,
        answer,
        sources: citedSources,
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
      sources: citedSources,
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
      const answer = normalizeTemporalAnswer({
        answer: web.answer,
        message,
        currentDate: getCurrentDateContext()
      });

      return res.status(200).json({
        mode: "web",
        answer,
        sources: [...(answerRag?.sources || []), ...(web.sources || [])],
        webSearchAttempted: webAllowed,
        webSearchUsed: true,
        webSearchConfigured: isTavilyConfigured(),
        providerWarning: "OpenAI quota is not available, so this answer is shown directly from Tavily web search results."
      });
    }

    if (isQuotaError && answerRag?.confident) {
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
