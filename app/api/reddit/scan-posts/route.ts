import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 300;

const APIFY_TOKEN = process.env.APIFY_API_TOKEN;
const ACTOR_ID = "trudax~reddit-scraper-lite";

interface RedditPost {
  id: string;
  title: string;
  selftext: string;
  url: string;
  subreddit: string;
  score: number;
  numComments: number;
  created: number;
  author: string;
  flair: string;
  relevance?: number;
}

const delay = (ms: number) => new Promise(r => setTimeout(r, ms));
const randomDelay = (minMs: number, maxMs: number) => delay(minMs + Math.random() * (maxMs - minMs));

async function runApifyActor(startUrls: { url: string }[], label: string): Promise<unknown[]> {
  const input = {
    startUrls,
    maxItems: 50,
    maxPostCount: 50,
    skipComments: true,
    proxy: { useApifyProxy: true },
  };

  const res = await fetch(
    `https://api.apify.com/v2/acts/${ACTOR_ID}/run-sync-get-dataset-items?token=${APIFY_TOKEN}&timeout=180&memory=1024`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
      signal: AbortSignal.timeout(200000),
    }
  );

  if (!res.ok) {
    const text = await res.text();
    console.error(`Apify failed [${label}]: ${res.status} ${text.slice(0, 200)}`);
    return [];
  }

  const items = await res.json();
  console.log(`Apify [${label}]: ${Array.isArray(items) ? items.length : 0} items`);
  return Array.isArray(items) ? items : [];
}

function mapItem(item: Record<string, unknown>, subreddit: string): RedditPost | null {
  const id = (item.id || item.postId || item.url) as string;
  if (!id || !item.title) return null;

  const oneMonthAgo = Math.floor(Date.now() / 1000) - 30 * 24 * 60 * 60;
  const created = item.createdAt
    ? Math.floor(new Date(item.createdAt as string).getTime() / 1000)
    : (item.created_utc as number) || 0;

  if (created && created < oneMonthAgo) return null;

  return {
    id: String(id),
    title: (item.title as string) || "",
    selftext: ((item.body || item.selftext || item.text || "") as string).slice(0, 800),
    url: (item.url as string)?.startsWith("http")
      ? (item.url as string)
      : `https://www.reddit.com${(item.url as string) || ""}`,
    subreddit: (item.subreddit as string) || subreddit,
    score: (item.score || item.upvotes || 0) as number,
    numComments: (item.numberOfComments || item.numComments || item.num_comments || 0) as number,
    created,
    author: (item.author || item.username || "") as string,
    flair: (item.flair || item.linkFlairText || "") as string,
  };
}

async function fetchPostsViaApify(subreddit: string, keywords: string): Promise<RedditPost[]> {
  if (!APIFY_TOKEN) {
    console.error("APIFY_API_TOKEN not set");
    return [];
  }

  const seen = new Set<string>();
  const posts: RedditPost[] = [];

  // Pass 1: recent posts feed
  const newFeedItems = await runApifyActor(
    [{ url: `https://www.reddit.com/r/${subreddit}/new/` }],
    `r/${subreddit} /new`
  );
  for (const item of newFeedItems) {
    const post = mapItem(item as Record<string, unknown>, subreddit);
    if (post && !seen.has(post.id)) { seen.add(post.id); posts.push(post); }
  }

  // Human-like pause between requests (3–7 seconds)
  await randomDelay(3000, 7000);

  // Pass 2: keyword searches (up to 2 keywords)
  if (keywords) {
    const kws = keywords.split(/[,]+/).map(k => k.trim()).filter(Boolean).slice(0, 2);
    for (const kw of kws) {
      const searchItems = await runApifyActor(
        [{ url: `https://www.reddit.com/r/${subreddit}/search/?q=${encodeURIComponent(kw)}&sort=new&t=month` }],
        `r/${subreddit} search:"${kw}"`
      );
      for (const item of searchItems) {
        const post = mapItem(item as Record<string, unknown>, subreddit);
        if (post && !seen.has(post.id)) { seen.add(post.id); posts.push(post); }
      }
      // Pause between keyword searches (4–9 seconds)
      await randomDelay(4000, 9000);
    }
  }

  console.log(`r/${subreddit}: ${posts.length} unique posts collected`);
  return posts;
}

export async function POST(req: NextRequest) {
  try {
    const { subreddits, keywords } = await req.json() as {
      subreddits: string[];
      keywords: string;
    };

    if (!subreddits?.length) {
      return NextResponse.json({ error: "No subreddits provided" }, { status: 400 });
    }

    const results: { subreddit: string; posts: (RedditPost & { relevance: number })[] }[] = [];

    for (let i = 0; i < subreddits.length; i++) {
      const subreddit = subreddits[i];

      // Pause between subreddits (5–12 seconds) to look human
      if (i > 0) await randomDelay(5000, 12000);

      const posts = await fetchPostsViaApify(subreddit, keywords);

      if (posts.length > 0) {
        const scored = posts
          .map(post => ({ ...post, relevance: 0 }))
          .slice(0, 50);
        results.push({ subreddit, posts: scored });
      }
    }

    const total = results.reduce((s, r) => s + r.posts.length, 0);
    console.log(`Total: ${results.length} subreddits, ${total} posts`);

    return NextResponse.json({ results });
  } catch (err) {
    console.error("scan-posts error:", err);
    return NextResponse.json({ error: "Failed to scan posts" }, { status: 500 });
  }
}
