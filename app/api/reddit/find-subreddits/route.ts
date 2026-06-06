import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

let client: Anthropic;

export async function POST(req: NextRequest) {
  try {
    client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
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

    console.log("Claude raw response:", content.text.slice(0, 500));

    let suggestions;
    try {
      const jsonMatch = content.text.match(/\[[\s\S]*\]/);
      console.log("JSON match found:", !!jsonMatch);
      suggestions = jsonMatch ? JSON.parse(jsonMatch[0]) : [];
      console.log("Suggestions count:", suggestions.length);
    } catch (e) {
      console.error("JSON parse error:", e);
      suggestions = [];
    }

    const results = suggestions.slice(0, 15).map((sub: Record<string, unknown>) => ({
      ...sub,
      subscribers: 0,
      displayName: sub.displayName || `r/${sub.name}`,
      communityRules: "",
      over18: false,
    }));

    return NextResponse.json({ subreddits: results });
  } catch (err) {
    console.error("find-subreddits error:", err);
    return NextResponse.json({ error: "Failed to find subreddits" }, { status: 500 });
  }
}
