import { NextRequest, NextResponse } from "next/server";

const ONE_MONTH_AGO = Math.floor(Date.now() / 1000) - 30 * 24 * 60 * 60;

async function redditFetch(url: string): Promise<Response> {
  return fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.5",
      "Accept-Encoding": "gzip, deflate, br",
      "DNT": "1",
      "Connection": "keep-alive",
      "Upgrade-Insecure-Requests": "1",
      "Sec-Fetch-Dest": "document",
      "Sec-Fetch-Mode": "navigate",
      "Sec-Fetch-Site": "none",
      "Cache-Control": "max-age=0",
    },
    signal: AbortSignal.timeout(15000),
  });
}

async function fetchSubredditPosts(subreddit: string): Promise<RedditPost[]> {
  const posts: RedditPost[] = [];
  const seen = new Set<string>();

  // Fetch from multiple endpoints to get broad coverage of last 30 days
  const endpoints = [
    `https://old.reddit.com/r/${subreddit}/top.json?t=month&limit=50&raw_json=1`,
    `https://old.reddit.com/r/${subreddit}/hot.json?limit=50&raw_json=1`,
    `https://old.reddit.com/r/${subreddit}/new.json?limit=50&raw_json=1`,
  ];

  for (const url of endpoints) {
    try {
      const res = await redditFetch(url);
      if (!res.ok) { console.log(`r/${subreddit} ${url} → ${res.status}`); continue; }

      const data = await res.json();
      for (const item of data?.data?.children || []) {
        const p = item.data;
        if (!p.title || seen.has(p.id)) continue;
        // Only include posts from last 30 days
        if (p.created_utc < ONE_MONTH_AGO) continue;
        seen.add(p.id);
        posts.push({
          id: p.id,
          title: p.title,
          selftext: p.selftext?.slice(0, 800) || "",
          url: `https://www.reddit.com${p.permalink}`,
          subreddit: p.subreddit || subreddit,
          score: p.score || 0,
          numComments: p.num_comments || 0,
          created: p.created_utc || 0,
          author: p.author || "",
          flair: p.link_flair_text || "",
        });
      }

      await new Promise((r) => setTimeout(r, 300));
    } catch (e) {
      console.log(`Fetch error for r/${subreddit}:`, e);
    }
  }

  console.log(`r/${subreddit}: fetched ${posts.length} posts from last 30 days`);
  return posts;
}

export async function POST(req: NextRequest) {
  try {
    const { subreddits, keywords, postDescription } = await req.json() as {
      subreddits: string[];
      keywords: string;
      postDescription?: string;
    };

    if (!subreddits?.length) {
      return NextResponse.json({ error: "No subreddits provided" }, { status: 400 });
    }

    const keywordList = keywords
      ? keywords.toLowerCase().split(/[,\s]+/).filter(Boolean)
      : [];

    const descWords = postDescription
      ? postDescription.toLowerCase().split(/\s+/).filter((w) => w.length > 3)
      : [];

    const results: SubredditPosts[] = [];

    for (const subreddit of subreddits) {
      const posts = await fetchSubredditPosts(subreddit);

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
        .slice(0, 30); // top 30 per subreddit — Claude will do semantic filtering next

      if (scored.length > 0) {
        results.push({ subreddit, posts: scored });
      }

      await new Promise((r) => setTimeout(r, 400));
    }

    console.log(`Total: ${results.length} subreddits, ${results.reduce((s, r) => s + r.posts.length, 0)} posts`);

    if (results.length === 0) {
      return NextResponse.json({
        results: [],
        note: "Reddit API unavailable from this server. Run locally for real posts.",
      });
    }

    return NextResponse.json({ results });
  } catch (err) {
    console.error("scan-posts error:", err);
    return NextResponse.json({ error: "Failed to scan posts" }, { status: 500 });
  }
}

interface RedditPost { id: string; title: string; selftext: string; url: string; subreddit: string; score: number; numComments: number; created: number; author: string; flair: string; relevance?: number; }
interface SubredditPosts { subreddit: string; posts: (RedditPost & { relevance: number })[]; }
