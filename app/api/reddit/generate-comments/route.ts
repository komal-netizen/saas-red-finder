import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

export async function POST(req: NextRequest) {
  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const { posts, businessDescription, keywords, subredditRules } = await req.json();
    if (!posts?.length) return NextResponse.json({ error: "No posts provided" }, { status: 400 });

    const allComments: GeneratedComment[] = [];
    const batchSize = 5;

    for (let i = 0; i < posts.length; i += batchSize) {
      const batch = posts.slice(i, i + batchSize);
      const postsText = batch
        .map((p: RedditPost, idx: number) => `Post ${idx + 1} [r/${p.subreddit}]:\nTitle: ${p.title}\nBody: ${p.selftext || "(no body)"}\nURL: ${p.url}\nRules context: ${subredditRules?.[p.subreddit] || "Be helpful and genuine"}`)
        .join("\n\n---\n\n");

      const message = await client.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 2048,
        messages: [{
          role: "user",
          content: `You are a Reddit community expert. Generate genuine, helpful comment replies that subtly promote this business:\n\nBusiness: ${businessDescription}\nKeywords to include naturally: ${keywords || ""}\n\nRULES:\n- Provide REAL value first\n- Never be spammy\n- Use natural Reddit tone\n- 2-5 sentences\n\n${postsText}\n\nReturn ONLY a JSON array:\n[\n  {\n    "postUrl": "url",\n    "postTitle": "title",\n    "subreddit": "name",\n    "comment": "full comment text",\n    "keywordsUsed": ["kw1"],\n    "promotionLevel": "none|subtle|moderate",\n    "safetyScore": 95,\n    "safetyNotes": "why safe"\n  }\n]`,
        }],
      });

      const content = message.content[0];
      if (content.type === "text") {
        try {
          const jsonMatch = content.text.match(/\[[\s\S]*\]/);
          if (jsonMatch) allComments.push(...JSON.parse(jsonMatch[0]));
        } catch { /* skip malformed */ }
      }
    }

    return NextResponse.json({ comments: allComments });
  } catch (err) {
    console.error("generate-comments error:", err);
    return NextResponse.json({ error: "Failed to generate comments" }, { status: 500 });
  }
}

interface RedditPost { url: string; title: string; selftext: string; subreddit: string; }
interface GeneratedComment { postUrl: string; postTitle: string; subreddit: string; comment: string; keywordsUsed: string[]; promotionLevel: string; safetyScore: number; safetyNotes: string; }
