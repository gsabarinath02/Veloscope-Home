import dotenv from "dotenv";

dotenv.config({ path: ".env.local", quiet: true });
dotenv.config({ path: ".env", quiet: true });

export function isOpenAIConfigured() {
  return Boolean(process.env.OPENAI_API_KEY);
}

export function getDeepgramApiKey() {
  return process.env.DEEPGRAM_API_KEY || process.env.Deepgram_API_Key || "";
}

export function isDeepgramConfigured() {
  return Boolean(getDeepgramApiKey());
}

export function getOpenAIModel() {
  return process.env.OPENAI_MODEL || "gpt-4.1-mini";
}
