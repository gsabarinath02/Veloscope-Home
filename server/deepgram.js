import { getDeepgramApiKey, isDeepgramConfigured } from "./env.js";

export async function transcribeAudio({ audio, contentType }) {
  if (!isDeepgramConfigured()) {
    return {
      configured: false,
      transcript: "",
      error: "DEEPGRAM_API_KEY is not configured"
    };
  }

  const apiKey = getDeepgramApiKey();
  const params = new URLSearchParams({
    model: "nova-3",
    smart_format: "true",
    punctuate: "true",
    language: "en",
    numerals: "true",
    filler_words: "false"
  });
  const response = await fetch(`https://api.deepgram.com/v1/listen?${params.toString()}`, {
    method: "POST",
    headers: {
      Authorization: `Token ${apiKey}`,
      "Content-Type": contentType || "audio/webm"
    },
    body: audio
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`Deepgram transcription failed with ${response.status}: ${message}`);
  }

  const data = await response.json();
  const alternatives = data.results?.channels?.[0]?.alternatives || [];
  const transcript =
    alternatives[0]?.transcript?.trim() ||
    data.results?.utterances?.map((utterance) => utterance.transcript).join(" ").trim() ||
    "";

  return {
    configured: true,
    transcript,
    confidence: alternatives[0]?.confidence || 0,
    alternatives: alternatives
      .slice(0, 3)
      .map((alternative) => ({
        transcript: alternative.transcript?.trim() || "",
        confidence: alternative.confidence || 0
      }))
      .filter((alternative) => alternative.transcript),
    rawDuration: data.metadata?.duration
  };
}

export async function synthesizeSpeech({ text }) {
  if (!isDeepgramConfigured()) {
    return {
      configured: false,
      audio: null,
      contentType: "",
      error: "DEEPGRAM_API_KEY is not configured"
    };
  }

  const cleanText = String(text || "").replace(/\s+/g, " ").trim().slice(0, 1200);
  if (!cleanText) {
    return {
      configured: true,
      audio: null,
      contentType: "",
      error: "Text is required"
    };
  }

  const apiKey = getDeepgramApiKey();
  const response = await fetch("https://api.deepgram.com/v1/speak?model=aura-2-thalia-en", {
    method: "POST",
    headers: {
      Authorization: `Token ${apiKey}`,
      "Content-Type": "application/json",
      Accept: "audio/mpeg"
    },
    body: JSON.stringify({ text: cleanText })
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`Deepgram TTS failed with ${response.status}: ${message}`);
  }

  return {
    configured: true,
    audio: Buffer.from(await response.arrayBuffer()),
    contentType: response.headers.get("content-type") || "audio/mpeg"
  };
}
