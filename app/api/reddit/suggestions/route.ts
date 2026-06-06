import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

export async function POST(req: NextRequest) {
  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const { businessDescription, websiteUrl, keywords } = await req.json();

    const input = [
      businessDescription && `Business: ${businessDescription}`,
      websiteUrl && `Website: ${websiteUrl}`,
      keywords && `Keywords: ${keywords}`,
    ].filter(Boolean).join("\n");

    const message = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      messages: [{
        role: "user",
        content: `Based on this business, suggest post types to target on Reddit and keywords to find them.

${input}

Return ONLY this JSON (no markdown):
{
  "postSuggestions": [
    "New grads asking for career advice or mentorship",
    "People struggling with their first job in the field",
    "Students asking about clinicals or job placement",
    "Professionals seeking mentor-mentee relationships",
    "Posts about burnout or career transitions"
  ],
  "keywordSuggestions": ["mentorship", "new grad", "career advice", "first job", "burnout", "clinical rotation"]
}

Give 5 post type suggestions and 8-10 keyword suggestions. Be specific to the business niche.`,
      }],
    });

    const content = message.content[0];
    if (content.type !== "text") throw new Error("Unexpected response");

    const jsonMatch = content.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON found");

    const result = JSON.parse(jsonMatch[0]);
    return NextResponse.json(result);
  } catch (err) {
    console.error("suggestions error:", err);
    return NextResponse.json({ error: "Failed to generate suggestions" }, { status: 500 });
  }
}
