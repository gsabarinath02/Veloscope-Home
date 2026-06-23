export function isTavilyConfigured() {
  return Boolean(process.env.TAVILY_API_KEY);
}

export async function searchWithTavily(query) {
  if (!isTavilyConfigured()) {
    return null;
  }

  const response = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: process.env.TAVILY_API_KEY,
      query,
      search_depth: "basic",
      include_answer: true,
      max_results: 4
    })
  });

  if (!response.ok) {
    throw new Error(`Tavily search failed with ${response.status}`);
  }

  const data = await response.json();
  const sources = (data.results || [])
    .filter((result) => result.url)
    .slice(0, 3)
    .map((result) => ({
      title: result.title || result.url,
      url: result.url,
      type: "web"
    }));

  return {
    answer: data.answer || summarizeResults(data.results || []),
    sources,
    results: (data.results || []).slice(0, 4).map((result) => ({
      title: result.title || result.url,
      url: result.url,
      content: result.content || ""
    }))
  };
}

function summarizeResults(results) {
  const snippets = results
    .map((result) => result.content)
    .filter(Boolean)
    .slice(0, 3);

  if (!snippets.length) return "";
  return `I found these web results:\n\n${snippets.map((snippet) => `- ${snippet}`).join("\n")}`;
}
