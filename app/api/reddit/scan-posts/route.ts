import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const { subreddits, keywords } = await req.json() as { subreddits: string[]; keywords: string };

    if (!subreddits?.length) {
      return NextResponse.json({ error: "No subreddits provided" }, { status: 400 });
    }

    const keywordList = keywords ? keywords.toLowerCase().split(/[,\s]+/).filter(Boolean) : [];

    const allPosts = await Promise.allSettled(
      subreddits.map(async (subreddit: string) => {
        try {
          const [hotRes, newRes] = await Promise.allSettled([
            fetch(`https://www.reddit.com/r/${subreddit}/hot.json?limit=25`, { headers: { "User-Agent": "RedditMarketingApp/1.0" }, signal: AbortSignal.timeout(8000) }),
            fetch(`https://www.reddit.com/r/${subreddit}/new.json?limit=15`, { headers: { "User-Agent": "RedditMarketingApp/1.0" }, signal: AbortSignal.timeout(8000) }),
          ]);

          const posts: RedditPost[] = [];
          for (const result of [hotRes, newRes]) {
            if (result.status === "fulfilled" && result.value.ok) {
              const data = await result.value.json();
              for (const item of data?.data?.children || []) {
                const p = item.data;
                if (p.is_self || p.selftext) {
                  posts.push({ id: p.id, title: p.title, selftext: p.selftext?.slice(0, 500) || "", url: `https://reddit.com${p.permalink}`, subreddit: p.subreddit, score: p.score, numComments: p.num_comments, created: p.created_utc, author: p.author, flair: p.link_flair_text || "" });
                }
              }
            }
          }

          const seen = new Set<string>();
          const unique = posts.filter((p) => { if (seen.has(p.id)) return false; seen.add(p.id); return true; });

          const scored = unique
            .map((post) => {
              const text = `${post.title} ${post.selftext}`.toLowerCase();
              const keywordHits = keywordList.filter((k) => text.includes(k)).length;
              const relevance = keywordHits * 20 + Math.min(post.score / 10, 30) + Math.min(post.numComments * 2, 20);
              return { ...post, relevance: Math.round(relevance) };
            })
            .sort((a, b) => b.relevance - a.relevance)
            .slice(0, 10);

          return { subreddit, posts: scored };
        } catch {
          return { subreddit, posts: [] };
        }
      })
    );

    const results = allPosts
      .filter((r): r is PromiseFulfilledResult<SubredditPosts> => r.status === "fulfilled")
      .map((r) => r.value)
      .filter((r) => r.posts.length > 0);

    return NextResponse.json({ results });
  } catch (err) {
    console.error("scan-posts error:", err);
    return NextResponse.json({ error: "Failed to scan posts" }, { status: 500 });
  }
}

interface RedditPost { id: string; title: string; selftext: string; url: string; subreddit: string; score: number; numComments: number; created: number; author: string; flair: string; relevance?: number; }
interface SubredditPosts { subreddit: string; posts: (RedditPost & { relevance: number })[]; }
