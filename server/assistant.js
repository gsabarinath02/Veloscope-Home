import OpenAI from "openai";
import { getOpenAIModel, isOpenAIConfigured } from "./env.js";

let client;
const APP_TIME_ZONE = process.env.APP_TIME_ZONE || "Asia/Kolkata";

function getClient() {
  if (!isOpenAIConfigured()) {
    return null;
  }

  client ||= new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
  });

  return client;
}

function buildContext({ rag, web }) {
  return {
    docs: rag.chunks.map((chunk, index) => ({
      id: `doc-${index + 1}`,
      title: chunk.title,
      heading: chunk.heading,
      text: chunk.text
    })),
    web: (web?.results || []).map((result, index) => ({
      id: `web-${index + 1}`,
      title: result.title,
      url: result.url,
      content: result.content
    }))
  };
}

export function getCurrentDateContext() {
  const now = new Date();
  const date = new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(now);
  const displayDate = new Intl.DateTimeFormat("en-IN", {
    timeZone: APP_TIME_ZONE,
    dateStyle: "full"
  }).format(now);

  return {
    date,
    displayDate,
    timeZone: APP_TIME_ZONE
  };
}

export async function answerWithOpenAI({ message, rag, web, forceTicket = false }) {
  const openai = getClient();

  if (!openai) {
    return {
      mode: "ticket",
      answer: "OpenAI is not connected yet. I created a ticket so the event team can follow up.",
      needsTicket: true,
      ticketReason: "openai_not_configured"
    };
  }

  const context = buildContext({ rag, web });
  const currentDate = getCurrentDateContext();
  const response = await openai.responses.create({
    model: getOpenAIModel(),
    input: [
      {
        role: "system",
        content:
          "You are Eventforce AI Assistant on eventforce.ai. Answer event attendee and organizer questions using only the approved event documents and web search results provided. Keep answers concise, helpful, and grounded. The current date is provided in the user payload. For any question asking about next, upcoming, current, latest, today, tomorrow, this weekend, weather, schedules, or future event dates, compare every date in the sources against the current date. Never describe a date before the current date as next, upcoming, current, or scheduled in the future. Do not write phrases like 'the next event already took place'. Instead say 'the date I found for the 2026 event was...' or 'the most recent listed date was...' and then state that a future/next date is not announced or not found in the browsed sources. If no reliable future source is found, say so clearly. Do not mention different events, related events, or alternatives unless the user explicitly asks for alternatives. If the question is account-specific, asks for billing, invoice, refund request, login, private access, contracts, legal help, or cannot be answered from the provided context, choose ticket mode. Do not invent facts. Return strict JSON only."
      },
      {
        role: "user",
        content: JSON.stringify({
          userQuestion: message,
          forceTicket,
          currentDate,
          localDocumentContext: context.docs,
          webSearchContext: context.web,
          temporalRules: [
            "Treat any event date earlier than currentDate.date as past.",
            "If asked for the next/upcoming event and sources only show past dates, do not call the past date next; answer with the past/most recent listed date and state that the next date is not announced/found.",
            "Stay on the exact event named by the user. Do not introduce dates for different events.",
            "When correcting date confusion, mention the current date and say 'the next date is not announced' when appropriate."
          ],
          outputSchema: {
            mode: "answer | ticket",
            answer: "string",
            ticketReason: "string",
            citedSourceTitles: ["string"]
          }
        })
      }
    ],
    text: {
      format: {
        type: "json_schema",
        name: "eventforce_assistant_result",
        strict: true,
        schema: {
          type: "object",
          additionalProperties: false,
          properties: {
            mode: { type: "string", enum: ["answer", "ticket"] },
            answer: { type: "string" },
            ticketReason: { type: "string" },
            citedSourceTitles: {
              type: "array",
              items: { type: "string" }
            }
          },
          required: ["mode", "answer", "ticketReason", "citedSourceTitles"]
        }
      }
    }
  });

  const parsed = JSON.parse(response.output_text);

  return {
    mode: parsed.mode === "ticket" ? "ticket" : web ? "web" : "rag",
    answer: parsed.answer,
    needsTicket: parsed.mode === "ticket",
    ticketReason: parsed.ticketReason || "model_requested_ticket",
    citedSourceTitles: parsed.citedSourceTitles || []
  };
}
