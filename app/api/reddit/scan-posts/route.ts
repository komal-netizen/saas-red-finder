import { NextRequest, NextResponse } from "next/server";

async function getRedditToken(): Promise<string | null> {
  const clientId = process.env.REDDIT_CLIENT_ID;
  const clientSecret = process.env.REDDIT_CLIENT_SECRET;
  const refreshToken = process.env.REDDIT_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) return null;

  try {
    const res = await fetch("https://www.reddit.com/api/v1/access_token", {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "RedditMarketingApp/1.0 by /u/komal_webdot",
      },
      body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.access_token || null;
  } catch {
    return null;
  }
}

async function fetchPosts(subreddit: string, sort: string, token: string | null): Promise<Response> {
  const url = token
    ? `https://oauth.reddit.com/r/${subreddit}/${sort}.json?limit=25`
    : `https://www.reddit.com/r/${subreddit}/${sort}.json?limit=25`;

  return fetch(url, {
    headers: {
      Authorization: token ? `Bearer ${token}` : "",
      "User-Agent": "RedditMarketingApp/1.0 by /u/komal_webdot",
    },
    signal: AbortSignal.timeout(10000),
  });
}

export async function POST(req: NextRequest) {
  try {
    const { subreddits, keywords } = await req.json() as { subreddits: string[]; keywords: string };

    if (!subreddits?.length) {
      return NextResponse.json({ error: "No subreddits provided" }, { status: 400 });
    }

    const keywordList = keywords ? keywords.toLowerCase().split(/[,\s]+/).filter(Boolean) : [];
    const token = await getRedditToken();
    console.log("Reddit token obtained:", !!token);

    const allPosts = await Promise.allSettled(
      subreddits.map(async (subreddit: string) => {
        try {
          const [hotRes, newRes] = await Promise.allSettled([
            fetchPosts(subreddit, "hot", token),
            fetchPosts(subreddit, "new", token),
          ]);

          const posts: RedditPost[] = [];
          for (const result of [hotRes, newRes]) {
            if (result.status === "fulfilled" && result.value.ok) {
              const data = await result.value.json();
              for (const item of data?.data?.children || []) {
                const p = item.data;
                if (p.title) {
                  posts.push({
                    id: p.id,
                    title: p.title,
                    selftext: p.selftext?.slice(0, 500) || "",
                    url: `https://reddit.com${p.permalink}`,
                    subreddit: p.subreddit || subreddit,
                    score: p.score || 0,
                    numComments: p.num_comments || 0,
                    created: p.created_utc || 0,
                    author: p.author || "",
                    flair: p.link_flair_text || "",
                  });
                }
              }
            } else if (result.status === "fulfilled") {
              console.log(`Failed to fetch r/${subreddit}: status ${result.value.status}`);
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

          console.log(`r/${subreddit}: ${scored.length} posts found`);
          return { subreddit, posts: scored };
        } catch (e) {
          console.error(`Error fetching r/${subreddit}:`, e);
          return { subreddit, posts: [] };
        }
      })
    );

    const results = allPosts
      .filter((r): r is PromiseFulfilledResult<SubredditPosts> => r.status === "fulfilled")
      .map((r) => r.value)
      .filter((r) => r.posts.length > 0);

    console.log(`Total subreddits with posts: ${results.length}`);
    return NextResponse.json({ results });
  } catch (err) {
    console.error("scan-posts error:", err);
    return NextResponse.json({ error: "Failed to scan posts" }, { status: 500 });
  }
}

interface RedditPost { id: string; title: string; selftext: string; url: string; subreddit: string; score: number; numComments: number; created: number; author: string; flair: string; relevance?: number; }
interface SubredditPosts { subreddit: string; posts: (RedditPost & { relevance: number })[]; }
