import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

export async function POST(req: NextRequest) {
  try {
    const { samples } = await req.json() as { samples: string };
    if (!samples?.trim()) return NextResponse.json({ error: "No samples provided" }, { status: 400 });

    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const msg = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 300,
      messages: [{
        role: "user",
        content: `Analyse the writing style of these samples in 2-3 sentences. Focus on: tone (formal/casual), sentence length, use of humour, empathy level, how they give advice, and any distinctive patterns. Be specific and descriptive.

Writing samples:
${samples.slice(0, 3000)}

Return only the style description, no preamble.`,
      }],
    });

    const content = msg.content[0];
    const analysis = content.type === "text" ? content.text : "";
    return NextResponse.json({ analysis });
  } catch (err) {
    console.error("analyze-tone error:", err);
    return NextResponse.json({ error: "Failed to analyse tone" }, { status: 500 });
  }
}
