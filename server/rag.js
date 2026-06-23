import fs from "node:fs";
import path from "node:path";

const STOP_WORDS = new Set([
  "a",
  "about",
  "after",
  "all",
  "also",
  "am",
  "an",
  "and",
  "any",
  "are",
  "as",
  "at",
  "be",
  "by",
  "can",
  "do",
  "for",
  "from",
  "get",
  "has",
  "have",
  "help",
  "how",
  "i",
  "in",
  "is",
  "it",
  "me",
  "my",
  "of",
  "on",
  "or",
  "our",
  "please",
  "the",
  "there",
  "this",
  "to",
  "we",
  "what",
  "when",
  "where",
  "with",
  "you",
  "your"
]);

const SYNONYMS = new Map([
  ["badge", ["registration", "check", "pickup", "qr", "counter"]],
  ["badges", ["registration", "check", "pickup", "qr", "counter"]],
  ["photo", ["photoapp", "gallery", "media", "download", "photos"]],
  ["photos", ["photoapp", "gallery", "media", "download", "photo"]],
  ["whatsapp", ["message", "messaging", "reminder", "updates"]],
  ["message", ["whatsapp", "messaging", "reminder", "updates"]],
  ["roi", ["crm", "sponsor", "lead", "analytics", "export"]],
  ["sponsor", ["roi", "crm", "lead", "analytics"]],
  ["feedback", ["survey", "rating", "sentiment", "comment"]],
  ["parking", ["venue", "travel", "arrival"]],
  ["agenda", ["schedule", "session", "reminder"]],
  ["schedule", ["agenda", "session", "reminder"]]
]);

let cachedIndex;

function tokenize(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 2 && !STOP_WORDS.has(token));
}

function expandTokens(tokens) {
  const expanded = new Set(tokens);
  for (const token of tokens) {
    for (const related of SYNONYMS.get(token) || []) {
      expanded.add(related);
    }
  }
  return [...expanded];
}

function parseDoc(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  const [firstLine, ...rest] = raw.split("\n");
  const title = firstLine.replace(/^#\s*/, "").trim() || path.basename(filePath);
  const sections = rest
    .join("\n")
    .split(/\n(?=##\s+)/)
    .map((section) => section.trim())
    .filter(Boolean);

  return sections.map((section, index) => {
    const lines = section.split("\n");
    const heading = lines[0]?.replace(/^##\s*/, "").trim() || title;
    const body = lines.slice(1).join("\n").trim();
    const text = `${heading}\n${body}`;
    return {
      id: `${path.basename(filePath)}-${index}`,
      title,
      heading,
      body,
      text,
      tokens: tokenize(`${title} ${heading} ${text}`)
    };
  });
}

export function loadKnowledgeBase() {
  if (cachedIndex) return cachedIndex;

  const docsDir = path.join(process.cwd(), "server", "data", "docs");
  const files = fs
    .readdirSync(docsDir)
    .filter((file) => file.endsWith(".md"))
    .sort();

  cachedIndex = files.flatMap((file) => parseDoc(path.join(docsDir, file)));
  return cachedIndex;
}

function scoreChunk(chunk, queryTokens) {
  const tokenCounts = new Map();
  for (const token of chunk.tokens) {
    tokenCounts.set(token, (tokenCounts.get(token) || 0) + 1);
  }

  return queryTokens.reduce((score, token) => {
    const count = tokenCounts.get(token) || 0;
    const headingBoost = chunk.heading.toLowerCase().includes(token) ? 2.5 : 0;
    const titleBoost = chunk.title.toLowerCase().includes(token) ? 1.5 : 0;
    return score + count + headingBoost + titleBoost;
  }, 0);
}

function sentenceRank(sentence, queryTokens) {
  const lower = sentence.toLowerCase();
  return queryTokens.reduce((score, token) => score + (lower.includes(token) ? 1 : 0), 0);
}

function bestSentences(chunks, queryTokens) {
  const topChunkSentences = chunks[0]?.body
    .split(/(?<=[.!?])\s+|\n-/)
    .map((sentence) => sentence.replace(/^\s*[-*]\s*/, "").trim())
    .filter((sentence) => sentence.length > 30)
    .filter((sentence) => sentenceRank(sentence, queryTokens) > 0);

  if (topChunkSentences?.length >= 2) {
    return topChunkSentences.slice(0, 4);
  }

  const sentences = chunks
    .flatMap((chunk, chunkIndex) =>
      chunk.body
        .split(/(?<=[.!?])\s+|\n-/)
        .map((sentence) => sentence.replace(/^\s*[-*]\s*/, "").trim())
        .filter((sentence) => sentence.length > 30)
        .map((sentence) => ({
          sentence,
          score: sentenceRank(sentence, queryTokens),
          chunkIndex
        }))
    )
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.chunkIndex - b.chunkIndex)
    .slice(0, 4)
    .map((item) => item.sentence);

  return [...new Set(sentences)].slice(0, 4);
}

export function retrieveAnswer(question) {
  const rawTokens = tokenize(question);
  const queryTokens = expandTokens(rawTokens);

  if (queryTokens.length === 0) {
    return {
      confident: false,
      score: 0,
      answer: "",
      sources: []
    };
  }

  const matches = loadKnowledgeBase()
    .map((chunk) => ({ ...chunk, score: scoreChunk(chunk, queryTokens) }))
    .filter((chunk) => chunk.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  const topScore = matches[0]?.score || 0;
  const confident = topScore >= 3.5;
  const sentences = confident ? bestSentences(matches, queryTokens) : [];
  const answer =
    sentences.length > 0
      ? `Here is what I found in the event documents:\n\n${sentences.map((sentence) => `- ${sentence}`).join("\n")}`
      : "";

  return {
    confident,
    score: topScore,
    answer,
    sources: [
      ...new Map(
        matches.map((match) => [
          match.title,
          {
            title: match.title,
            heading: match.heading,
            type: "document"
          }
        ])
      ).values()
    ]
  };
}

export function retrieveContext(question, limit = 5) {
  const rawTokens = tokenize(question);
  const queryTokens = expandTokens(rawTokens);

  if (queryTokens.length === 0) {
    return {
      confident: false,
      score: 0,
      chunks: [],
      sources: []
    };
  }

  const chunks = loadKnowledgeBase()
    .map((chunk) => ({ ...chunk, score: scoreChunk(chunk, queryTokens) }))
    .filter((chunk) => chunk.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  const topScore = chunks[0]?.score || 0;

  return {
    confident: topScore >= 3.5,
    score: topScore,
    chunks: chunks.map((chunk) => ({
      title: chunk.title,
      heading: chunk.heading,
      text: chunk.body,
      score: chunk.score
    })),
    sources: [
      ...new Map(
        chunks.map((chunk) => [
          chunk.title,
          {
            title: chunk.title,
            heading: chunk.heading,
            type: "document"
          }
        ])
      ).values()
    ]
  };
}

export function shouldPreferTicket(question) {
  const lower = question.toLowerCase();
  const refundRequest =
    lower.includes("refund") &&
    !lower.includes("refund policy") &&
    !lower.includes("what is the refund") &&
    !lower.includes("tell me the refund");

  return [
    "invoice",
    "billing",
    "payment failed",
    "contract",
    "legal",
    "cannot access",
    "can't access",
    "can not access",
    "login not working",
    "password",
    "hotel booking",
    "flight booking",
    "change my hotel",
    "change my flight",
    "book me a hotel",
    "book me a flight",
    "cancel my hotel",
    "cancel my flight",
    "reschedule my hotel",
    "reschedule my flight"
  ].some((term) => lower.includes(term)) || refundRequest;
}

export function shouldSearchWeb(question) {
  const lower = question.toLowerCase();
  return [
    "latest",
    "today",
    "current",
    "news",
    "website",
    "web",
    "online",
    "competitor",
    "market",
    "weather",
    "upcoming",
    "marathon",
    "marathons",
    "trends",
    "trend",
    "best",
    "tips",
    "practices",
    "guidelines",
    "safety"
  ].some((term) => lower.includes(term));
}
