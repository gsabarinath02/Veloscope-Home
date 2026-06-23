import OpenAI from "openai";
import { getOpenAIModel, isOpenAIConfigured } from "./env.js";

let client;

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
  const response = await openai.responses.create({
    model: getOpenAIModel(),
    input: [
      {
        role: "system",
        content:
          "You are Eventforce AI Assistant on eventforce.ai. Answer event attendee and organizer questions using only the approved event documents and web search results provided. Keep answers concise, helpful, and grounded. If the question is account-specific, asks for billing, invoice, refund, login, private access, contracts, legal help, or cannot be answered from the provided context, choose ticket mode. Do not invent facts. Return strict JSON only."
      },
      {
        role: "user",
        content: JSON.stringify({
          userQuestion: message,
          forceTicket,
          localDocumentContext: context.docs,
          webSearchContext: context.web,
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
