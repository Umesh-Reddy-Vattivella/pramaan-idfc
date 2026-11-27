/* ------------------------------------------------------------------
   Server-only Tavily web search client (real-time search results with URLs).
   Free tier: 1,000 credits / month (advanced search = 2 credits).
   ------------------------------------------------------------------ */

export interface SearchResult {
  url: string;
  title: string;
  content: string;
  publishedDate?: string;
  query: string;
}

export async function tavilySearch(apiKey: string, query: string, opts: { maxResults?: number; depth?: 'basic' | 'advanced' } = {}): Promise<SearchResult[]> {
  const res = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      query,
      search_depth: opts.depth ?? 'advanced',
      max_results: opts.maxResults ?? 8,
      country: 'india',
      include_answer: false,
      include_raw_content: false,
    }),
    signal: AbortSignal.timeout(45000),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Tavily HTTP ${res.status}${res.status === 432 || res.status === 429 ? ' (plan / rate limit reached)' : ''} ${body.slice(0, 120)}`);
  }
  const j = (await res.json()) as { results?: { url: string; title?: string; content?: string; published_date?: string }[] };
  return (j.results ?? [])
    .filter((r) => r.url && r.content)
    .map((r) => ({ url: r.url, title: (r.title ?? '').slice(0, 200), content: (r.content ?? '').replace(/\s+/g, ' ').slice(0, 1500), publishedDate: r.published_date, query }));
}

/** Runs several searches in parallel; failed searches are reported, not thrown. De-duplicates by URL. */
export async function tavilyMulti(apiKey: string, queries: { q: string; depth?: 'basic' | 'advanced'; max?: number }[]) {
  const settled = await Promise.allSettled(queries.map((x) => tavilySearch(apiKey, x.q, { depth: x.depth, maxResults: x.max })));
  const seen = new Set<string>();
  const results: SearchResult[] = [];
  const errors: string[] = [];
  settled.forEach((s, i) => {
    if (s.status === 'rejected') return errors.push(`${queries[i].q}: ${s.reason instanceof Error ? s.reason.message : 'failed'}`);
    for (const r of s.value) {
      if (seen.has(r.url)) continue;
      seen.add(r.url);
      results.push(r);
    }
  });
  return { results, errors };
}
