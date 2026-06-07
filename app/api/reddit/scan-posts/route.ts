import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 120;

const APIFY_TOKEN = process.env.APIFY_API_TOKEN;
const ACTOR_ID = "trudax~reddit-scraper-lite";
const ACTOR_ID_FALLBACK = "apify~reddit-scraper";

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

async function fetchPostsViaApify(subreddit: string, keywords: string): Promise<RedditPost[]> {
  if (!APIFY_TOKEN) {
    console.error("APIFY_API_TOKEN not set");
    return [];
  }

  const searches = keywords
    ? keywords.split(/[,]+/).map(k => k.trim()).filter(Boolean).slice(0, 3)
    : [""];

  const startUrls = searches.map(kw => ({
    url: kw
      ? `https://www.reddit.com/r/${subreddit}/search/?q=${encodeURIComponent(kw)}&sort=new&t=month`
      : `https://www.reddit.com/r/${subreddit}/new/`,
  }));

  // Also add a direct new posts URL
  startUrls.push({ url: `https://www.reddit.com/r/${subreddit}/new/` });

  const input = {
    startUrls,
    maxItems: 50,
    maxPostCount: 50,
    skipComments: true,
    proxy: { useApifyProxy: true },
  };

  try {
    const runRes = await fetch(
      `https://api.apify.com/v2/acts/${ACTOR_ID}/run-sync-get-dataset-items?token=${APIFY_TOKEN}&timeout=90&memory=512`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
        signal: AbortSignal.timeout(100000),
      }
    );

    let items: unknown[];
    if (!runRes.ok) {
      const text = await runRes.text();
      console.error(`Apify lite failed for r/${subreddit}: ${runRes.status} — trying fallback actor`);
      // Fallback to official Reddit scraper
      const fallbackRes = await fetch(
        `https://api.apify.com/v2/acts/${ACTOR_ID_FALLBACK}/run-sync-get-dataset-items?token=${APIFY_TOKEN}&timeout=90&memory=512`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ startUrls, maxItems: 50, skipComments: true, proxy: { useApifyProxy: true } }),
          signal: AbortSignal.timeout(100000),
        }
      );
      if (!fallbackRes.ok) {
        const fb = await fallbackRes.text();
        console.error(`Apify fallback also failed for r/${subreddit}: ${fallbackRes.status} ${fb.slice(0, 200)}`);
        return [];
      }
      items = await fallbackRes.json();
    } else {
      items = await runRes.json();
    }
    console.log(`Apify r/${subreddit}: raw item count=${Array.isArray(items) ? items.length : "not array"}`);
    if (Array.isArray(items) && items.length > 0) {
      console.log(`Apify sample item keys:`, Object.keys(items[0]).join(", "));
      console.log(`Apify sample item:`, JSON.stringify(items[0]).slice(0, 400));
    }
    const posts: RedditPost[] = [];
    const seen = new Set<string>();
    const oneMonthAgo = Math.floor(Date.now() / 1000) - 30 * 24 * 60 * 60;

    for (const item of Array.isArray(items) ? items : []) {
      const id = item.id || item.postId || item.url;
      if (!id || seen.has(id)) continue;
      if (!item.title) continue;

      const created = item.createdAt
        ? Math.floor(new Date(item.createdAt).getTime() / 1000)
        : item.created_utc || 0;

      if (created && created < oneMonthAgo) continue;
      seen.add(id);

      posts.push({
        id: String(id),
        title: item.title || "",
        selftext: (item.body || item.selftext || item.text || "").slice(0, 800),
        url: item.url?.startsWith("http") ? item.url : `https://www.reddit.com${item.url || ""}`,
        subreddit: item.subreddit || subreddit,
        score: item.score || item.upvotes || 0,
        numComments: item.numberOfComments || item.numComments || item.num_comments || 0,
        created,
        author: item.author || item.username || "",
        flair: item.flair || item.linkFlairText || "",
      });
    }

    console.log(`Apify r/${subreddit}: ${posts.length} posts returned`);
    return posts;
  } catch (e) {
    console.error(`Apify fetch error for r/${subreddit}:`, e);
    return [];
  }
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

    const keywordList = keywords
      ? keywords.toLowerCase().split(/[,\s]+/).filter(Boolean)
      : [];

    const results: { subreddit: string; posts: (RedditPost & { relevance: number })[] }[] = [];

    for (const subreddit of subreddits) {
      const posts = await fetchPostsViaApify(subreddit, keywords);

      const scored = posts
        .map((post) => {
          const text = `${post.title} ${post.selftext}`.toLowerCase();
          const keywordHits = keywordList.filter((k) => text.includes(k)).length;
          const recency = Math.max(0, 30 - (Date.now() / 1000 - post.created) / 86400);
          const relevance =
            keywordHits * 20 +
            Math.min(post.score / 10, 30) +
            Math.min(post.numComments * 2, 20) +
            recency * 0.5;
          return { ...post, relevance: Math.round(relevance) };
        })
        .sort((a, b) => b.relevance - a.relevance)
        .slice(0, 30);

      if (scored.length > 0) {
        results.push({ subreddit, posts: scored });
      }
    }

    const total = results.reduce((s, r) => s + r.posts.length, 0);
    console.log(`Total: ${results.length} subreddits, ${total} posts via Apify`);

    return NextResponse.json({ results });
  } catch (err) {
    console.error("scan-posts error:", err);
    return NextResponse.json({ error: "Failed to scan posts" }, { status: 500 });
  }
}
