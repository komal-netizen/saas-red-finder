import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { Resend } from "resend";

export const maxDuration = 300;

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
}

interface CommentResult {
  postUrl: string;
  postTitle: string;
  subreddit: string;
  comment: string;
  keywordsUsed: string[];
  promotionLevel: string;
  safetyScore: number;
  safetyNotes: string;
  matchReason?: string;
}

export async function POST(req: NextRequest) {
  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const resend = new Resend(process.env.RESEND_API_KEY);

    const { posts, postTypes, keywords, businessDescription, email, schedule } = await req.json() as {
      posts: Post[];
      postTypes: string[];
      keywords: string;
      businessDescription: string;
      email: string;
      schedule: string;
    };

    if (!posts?.length) return NextResponse.json({ error: "No posts provided" }, { status: 400 });

    // Step 1: Semantically filter posts using Claude
    const relevantPosts: (Post & { matchReason: string; semanticScore: number })[] = [];
    const batchSize = 20;

    for (let i = 0; i < posts.length; i += batchSize) {
      const batch = posts.slice(i, i + batchSize);
      const postList = batch.map((p, idx) =>
        `[${idx}] r/${p.subreddit} | "${p.title}" | ${p.selftext ? p.selftext.slice(0, 200) : "(no body)"}`
      ).join("\n");

      try {
        const filterMsg = await client.messages.create({
          model: "claude-sonnet-4-6",
          max_tokens: 1024,
          messages: [{
            role: "user",
            content: `You are helping a business find Reddit posts where they can add genuine value with a comment.

Business: ${businessDescription}

They want posts matching ANY of these:
${postTypes.map((t, i) => `${i + 1}. ${t}`).join("\n")}

Posts (index | subreddit | title | excerpt):
${postList}

Score each post 0-100 for relevance (0=irrelevant, 100=perfect match). Only return posts scoring 45+.

Return ONLY JSON array:
[{"index": 0, "score": 85, "reason": "brief why"}]`,
          }],
        });

        const content = filterMsg.content[0];
        if (content.type === "text") {
          const match = content.text.match(/\[[\s\S]*\]/);
          if (match) {
            const scored = JSON.parse(match[0]) as { index: number; score: number; reason: string }[];
            for (const s of scored) {
              if (s.score >= 45 && batch[s.index]) {
                relevantPosts.push({ ...batch[s.index], matchReason: s.reason, semanticScore: s.score });
              }
            }
          }
        }
      } catch { /* skip failed batch */ }
    }

    if (relevantPosts.length === 0) {
      return NextResponse.json({ error: "No relevant posts found matching your post types. Try broader descriptions or check back later." }, { status: 200 });
    }

    // Step 2: Generate comments for relevant posts
    const comments: CommentResult[] = [];
    const commentBatch = 5;

    for (let i = 0; i < relevantPosts.length; i += commentBatch) {
      const batch = relevantPosts.slice(i, i + commentBatch);
      const postsText = batch.map((p, idx) =>
        `Post ${idx + 1} [r/${p.subreddit}]:\nTitle: ${p.title}\nBody: ${p.selftext || "(no body)"}\nURL: ${p.url}`
      ).join("\n\n---\n\n");

      try {
        const commentMsg = await client.messages.create({
          model: "claude-sonnet-4-6",
          max_tokens: 2048,
          messages: [{
            role: "user",
            content: `You are a Reddit expert. Write genuine, helpful comment replies that naturally mention this business where relevant:

Business: ${businessDescription}
Keywords to weave in naturally: ${keywords || "none"}

RULES:
- Provide real value first — answer their actual question/problem
- Mention the business only if it naturally fits (not forced)
- Sound like a real person, not a marketer
- 3-5 sentences, conversational Reddit tone
- Never say "I work for" or sound like an ad

${postsText}

Return ONLY a JSON array:
[{
  "postUrl": "url",
  "postTitle": "title",
  "subreddit": "name",
  "comment": "full comment text",
  "keywordsUsed": ["kw1"],
  "promotionLevel": "none|subtle|moderate",
  "safetyScore": 90,
  "safetyNotes": "why safe"
}]`,
          }],
        });

        const content = commentMsg.content[0];
        if (content.type === "text") {
          const match = content.text.match(/\[[\s\S]*\]/);
          if (match) {
            const parsed = JSON.parse(match[0]) as CommentResult[];
            const enriched = parsed.map((c, idx) => ({
              ...c,
              postUrl: batch[idx]?.url || c.postUrl,
              postTitle: batch[idx]?.title || c.postTitle,
              subreddit: batch[idx]?.subreddit || c.subreddit,
              matchReason: batch[idx]?.matchReason || "",
            }));
            comments.push(...enriched);
          }
        }
      } catch { /* skip failed batch */ }
    }

    // Step 3: Send email with formatted report
    const scheduleLabel = schedule === "hourly" ? "past hour" : schedule === "daily" ? "past 24 hours" : schedule === "weekly" ? "past week" : "past month";
    const now = new Date().toLocaleString("en-US", { dateStyle: "full", timeStyle: "short" });

    const emailHtml = buildEmailHtml(comments, businessDescription, scheduleLabel, now);

    if (process.env.RESEND_API_KEY) {
      await resend.emails.send({
        from: "Reddit Agent <onboarding@resend.dev>",
        to: email,
        subject: `Reddit Report — ${comments.length} opportunities found (${now})`,
        html: emailHtml,
      });
    }

    console.log(`run-agent: ${posts.length} posts → ${relevantPosts.length} relevant → ${comments.length} comments → emailed to ${email}`);
    return NextResponse.json({ commentCount: comments.length, relevantCount: relevantPosts.length });
  } catch (err) {
    console.error("run-agent error:", err);
    return NextResponse.json({ error: "Agent failed. Please try again." }, { status: 500 });
  }
}

function buildEmailHtml(comments: CommentResult[], business: string, timeframe: string, runAt: string): string {
  const rows = comments.map((c, i) => `
    <tr style="border-bottom: 1px solid #e5e7eb;">
      <td style="padding: 20px 0;">
        <div style="margin-bottom: 6px;">
          <span style="display: inline-block; background: #fff7ed; color: #ff4500; border: 1px solid #fed7aa; border-radius: 9999px; padding: 2px 10px; font-size: 12px; font-weight: 600;">r/${c.subreddit}</span>
          <span style="display: inline-block; background: ${c.safetyScore >= 80 ? "#f0fdf4" : "#fefce8"}; color: ${c.safetyScore >= 80 ? "#16a34a" : "#ca8a04"}; border: 1px solid ${c.safetyScore >= 80 ? "#bbf7d0" : "#fde68a"}; border-radius: 9999px; padding: 2px 10px; font-size: 12px; margin-left: 6px;">Safety ${c.safetyScore}/100</span>
        </div>
        <a href="${c.postUrl}" style="display: block; font-size: 15px; font-weight: 600; color: #111827; text-decoration: none; margin-bottom: 12px; line-height: 1.4;">${i + 1}. ${c.postTitle}</a>
        <div style="background: #f9fafb; border-left: 3px solid #ff4500; padding: 14px 16px; border-radius: 0 8px 8px 0; margin-bottom: 10px;">
          <p style="margin: 0; font-size: 14px; color: #374151; line-height: 1.6;">${c.comment}</p>
        </div>
        <div style="display: flex; gap: 12px; font-size: 12px; color: #9ca3af;">
          <span>Promotion: <strong style="color: #6b7280;">${c.promotionLevel}</strong></span>
          ${c.keywordsUsed?.length ? `<span>Keywords: <strong style="color: #6b7280;">${c.keywordsUsed.join(", ")}</strong></span>` : ""}
        </div>
        <div style="margin-top: 8px;">
          <a href="${c.postUrl}" style="display: inline-block; background: #ff4500; color: white; text-decoration: none; font-size: 12px; font-weight: 600; padding: 6px 14px; border-radius: 6px;">View Post & Comment →</a>
        </div>
      </td>
    </tr>
  `).join("");

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin: 0; padding: 0; background: #f3f4f6; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">
  <div style="max-width: 680px; margin: 0 auto; padding: 32px 16px;">

    <div style="background: white; border-radius: 16px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">

      <!-- Header -->
      <div style="background: #ff4500; padding: 28px 32px;">
        <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 8px;">
          <div style="width: 32px; height: 32px; background: rgba(255,255,255,0.2); border-radius: 8px; display: flex; align-items: center; justify-content: center;">
            <span style="color: white; font-size: 18px;">🤖</span>
          </div>
          <h1 style="margin: 0; color: white; font-size: 20px; font-weight: 700;">Reddit Agent Report</h1>
        </div>
        <p style="margin: 0; color: rgba(255,255,255,0.85); font-size: 14px;">
          ${comments.length} comment opportunities found from the ${timeframe} · ${runAt}
        </p>
      </div>

      <!-- Summary -->
      <div style="padding: 24px 32px; background: #fff7ed; border-bottom: 1px solid #fed7aa;">
        <p style="margin: 0; font-size: 14px; color: #92400e;">
          <strong>Business:</strong> ${business}
        </p>
        <p style="margin: 8px 0 0; font-size: 13px; color: #b45309;">
          Click any post link to go directly to Reddit and paste your comment. Each suggestion is crafted to add genuine value to the conversation.
        </p>
      </div>

      <!-- Comments -->
      <div style="padding: 0 32px;">
        <table style="width: 100%; border-collapse: collapse;">
          ${rows}
        </table>
      </div>

      <!-- Footer -->
      <div style="padding: 24px 32px; background: #f9fafb; border-top: 1px solid #e5e7eb; text-align: center;">
        <p style="margin: 0; font-size: 12px; color: #9ca3af;">
          Generated by Reddit Marketing Agent · Always review comments before posting
        </p>
      </div>
    </div>
  </div>
</body>
</html>`;
}
