import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

interface Post {
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

export async function POST(req: NextRequest) {
  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const { posts, postTypes, businessDescription } = await req.json() as {
      posts: Post[];
      postTypes: string[];
      businessDescription: string;
    };

    if (!posts?.length) return NextResponse.json({ filteredPosts: [] });
    if (!postTypes?.length) return NextResponse.json({ filteredPosts: posts.slice(0, 30) });

    // Process in batches of 25
    const batchSize = 25;
    const allFiltered: (Post & { semanticScore: number; matchReason: string })[] = [];

    for (let i = 0; i < posts.length; i += batchSize) {
      const batch = posts.slice(i, i + batchSize);

      const postList = batch.map((p, idx) =>
        `[${idx}] r/${p.subreddit} | "${p.title}" | ${p.selftext ? p.selftext.slice(0, 200) : "(no body)"}`
      ).join("\n");

      const message = await client.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 1024,
        messages: [{
          role: "user",
          content: `You are helping a business find Reddit posts where they can add value with a comment.

Business: ${businessDescription}

They want to find posts that match ANY of these descriptions:
${postTypes.map((t, i) => `${i + 1}. ${t}`).join("\n")}

Here are the Reddit posts (index | subreddit | title | body excerpt):
${postList}

For each post, score it 0-100 for how well it matches the intent above (0 = completely irrelevant, 100 = perfect match). A high score means this is exactly the kind of post the business can genuinely help with.

Return ONLY a JSON array (no explanation):
[{"index": 0, "score": 85, "reason": "one sentence why"}, ...]`,
        }],
      });

      const content = message.content[0];
      if (content.type === "text") {
        try {
          const jsonMatch = content.text.match(/\[[\s\S]*\]/);
          if (jsonMatch) {
            const scored = JSON.parse(jsonMatch[0]) as { index: number; score: number; reason: string }[];
            for (const s of scored) {
              if (s.score >= 40 && batch[s.index]) {
                allFiltered.push({ ...batch[s.index], semanticScore: s.score, matchReason: s.reason });
              }
            }
          }
        } catch { /* skip malformed */ }
      }
    }

    // Sort by semantic score desc, take top 30
    allFiltered.sort((a, b) => b.semanticScore - a.semanticScore);
    const top = allFiltered.slice(0, 30);

    console.log(`filter-posts: ${posts.length} → ${top.length} after semantic filtering`);
    return NextResponse.json({ filteredPosts: top });
  } catch (err) {
    console.error("filter-posts error:", err);
    // On error, return all posts unfiltered so the flow doesn't break
    return NextResponse.json({ filteredPosts: [] });
  }
}
