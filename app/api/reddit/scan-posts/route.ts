import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 120;

const ONE_MONTH_AGO = Math.floor(Date.now() / 1000) - 30 * 24 * 60 * 60;
const ARCTIC_BASE = "https://arctic-shift.quanticdev.com/api";

async function fetchFromArctic(subreddit: string, keywords: string): Promise<RedditPost[]> {
  const posts: RedditPost[] = [];
  const seen = new Set<string>();
  const afterDate = new Date(ONE_MONTH_AGO * 1000).toISOString();

  // Search by keyword query + subreddit, get up to 100 posts
  const queries: string[] = [];

  // If keywords provided, search for each one
  if (keywords) {
    const kwList = keywords.split(/[,]+/).map(s => s.trim()).filter(Boolean).slice(0, 4);
    for (const kw of kwList) {
      queries.push(kw);
    }
  } else {
    queries.push(""); // no keyword filter, get general posts
  }

  for (const query of queries) {
    try {
      const params = new URLSearchParams({
        subreddit,
        after: afterDate,
        limit: "100",
        sort: "desc",
        ...(query ? { query } : {}),
      });

      const url = `${ARCTIC_BASE}/posts/search?${params}`;
      console.log(`Arctic Shift: ${url}`);

      const res = await fetch(url, {
        headers: { "Accept": "application/json" },
        signal: AbortSignal.timeout(15000),
      });

      if (!res.ok) {
        console.log(`Arctic Shift r/${subreddit} query="${query}" → ${res.status}`);
        continue;
      }

      const data = await res.json();
      const items = data?.data || [];

      for (const p of items) {
        if (!p.title || seen.has(p.id)) continue;
        seen.add(p.id);
        posts.push({
          id: p.id,
          title: p.title,
          selftext: (p.selftext || "").slice(0, 800),
          url: `https://www.reddit.com${p.permalink}`,
          subreddit: p.subreddit || subreddit,
          score: p.score || 0,
          numComments: p.num_comments || 0,
          created: p.created_utc || 0,
          author: p.author || "",
          flair: p.link_flair_text || "",
        });
      }
    } catch (e) {
      console.log(`Arctic Shift error for r/${subreddit}:`, e);
    }
  }

  console.log(`r/${subreddit}: fetched ${posts.length} posts via Arctic Shift`);
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

    const keywordList = keywords
      ? keywords.toLowerCase().split(/[,\s]+/).filter(Boolean)
      : [];

    const results: SubredditPosts[] = [];

    for (const subreddit of subreddits) {
      const posts = await fetchFromArctic(subreddit, keywords);

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

    console.log(`Total: ${results.length} subreddits, ${results.reduce((s, r) => s + r.posts.length, 0)} posts`);

    if (results.length === 0) {
      return NextResponse.json({ results: [], note: "No posts returned from Arctic Shift." });
    }

    return NextResponse.json({ results });
  } catch (err) {
    console.error("scan-posts error:", err);
    return NextResponse.json({ error: "Failed to scan posts" }, { status: 500 });
  }
}

interface RedditPost { id: string; title: string; selftext: string; url: string; subreddit: string; score: number; numComments: number; created: number; author: string; flair: string; relevance?: number; }
interface SubredditPosts { subreddit: string; posts: (RedditPost & { relevance: number })[]; }
