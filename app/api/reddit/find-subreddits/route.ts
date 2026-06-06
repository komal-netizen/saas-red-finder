import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(req: NextRequest) {
  try {
    const { businessDescription, websiteUrl, keywords } = await req.json();

    const input = [
      businessDescription && `Business: ${businessDescription}`,
      websiteUrl && `Website: ${websiteUrl}`,
      keywords && `Keywords: ${keywords}`,
    ]
      .filter(Boolean)
      .join("\n");

    if (!input) {
      return NextResponse.json({ error: "No input provided" }, { status: 400 });
    }

    const message = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: `You are a Reddit marketing expert. Based on the following business information, suggest 10-15 highly relevant subreddits where the business could genuinely add value through comments.\n\n${input}\n\nReturn ONLY a JSON array with this exact structure (no markdown, no explanation):\n[\n  {\n    "name": "subredditname",\n    "displayName": "r/subredditname",\n    "description": "Why this subreddit is relevant",\n    "estimatedSubscribers": "rough estimate like '500k'",\n    "relevanceScore": 95,\n    "marketingApproach": "How to add value here without being spammy"\n  }\n]\n\nFocus on subreddits where:\n1. The target audience genuinely exists\n2. Valuable, helpful comments are welcomed\n3. The business can provide real expertise\n4. Community rules allow tasteful business mentions`,
        },
      ],
    });

    const content = message.content[0];
    if (content.type !== "text") throw new Error("Unexpected response type");

    let suggestions;
    try {
      const jsonMatch = content.text.match(/\[[\s\S]*\]/);
      suggestions = jsonMatch ? JSON.parse(jsonMatch[0]) : [];
    } catch {
      suggestions = [];
    }

    const validated = await Promise.allSettled(
      suggestions.slice(0, 15).map(async (sub: Record<string, unknown>) => {
        try {
          const res = await fetch(
            `https://www.reddit.com/r/${sub.name}/about.json`,
            { headers: { "User-Agent": "RedditMarketingApp/1.0" }, signal: AbortSignal.timeout(5000) }
          );
          if (!res.ok) return null;
          const data = await res.json();
          const info = data?.data;
          return {
            ...sub,
            subscribers: info?.subscribers || 0,
            displayName: info?.display_name_prefixed || `r/${sub.name}`,
            communityRules: info?.public_description?.slice(0, 200) || "",
            over18: info?.over18 || false,
          };
        } catch {
          return null;
        }
      })
    );

    const results = validated
      .filter((r): r is PromiseFulfilledResult<Record<string, unknown>> => r.status === "fulfilled" && r.value !== null)
      .map((r) => r.value);

    return NextResponse.json({ subreddits: results });
  } catch (err) {
    console.error("find-subreddits error:", err);
    return NextResponse.json({ error: "Failed to find subreddits" }, { status: 500 });
  }
}
