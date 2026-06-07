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
            content: `You are a strict relevance filter. A business wants to comment on Reddit posts where they can genuinely help.

Business: ${businessDescription}

Target audience and purpose: This business should ONLY engage where the post author or commenters are people this business directly serves. The comment must naturally solve their problem.

Post types to look for (these are semantic descriptions, not keywords):
${postTypes.map((t, i) => `${i + 1}. ${t}`).join("\n")}

A post PASSES (score 70+) only if ALL of these are true:
- The post author is clearly someone this business helps (matches the target audience)
- The post topic matches at least one of the post type descriptions above
- Leaving a comment about this business would genuinely help the person, not feel forced or spammy

A post FAILS (score below 70) if:
- The post is about a different audience (e.g. patients, not practitioners)
- The post is news, a poll, or general discussion not seeking help
- The business solution doesn't directly address what the person is struggling with

Posts (index | subreddit | title | excerpt):
${postList}

Score each post 0-100. Return ONLY JSON array:
[{"index": 0, "score": 85, "reason": "brief why this person needs what the business offers"}]`,
          }],
        });

        const content = filterMsg.content[0];
        if (content.type === "text") {
          const match = content.text.match(/\[[\s\S]*\]/);
          if (match) {
            const scored = JSON.parse(match[0]) as { index: number; score: number; reason: string }[];
            for (const s of scored) {
              if (s.score >= 55 && batch[s.index]) {
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

    // Step 2: Generate comments for relevant posts (up to 30)
    const comments: CommentResult[] = [];
    const commentBatch = 5;
    const postsToProcess = relevantPosts.slice(0, 30);

    for (let i = 0; i < postsToProcess.length; i += commentBatch) {
      if (i > 0) await new Promise(r => setTimeout(r, 1200 + Math.random() * 3000));
      const batch = postsToProcess.slice(i, i + commentBatch);
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
  const bySubreddit: Record<string, CommentResult[]> = {};
  for (const c of comments) {
    if (!bySubreddit[c.subreddit]) bySubreddit[c.subreddit] = [];
    bySubreddit[c.subreddit].push(c);
  }

  const sections = Object.entries(bySubreddit).map(([sub, posts]) => `
    <div style="margin-bottom: 40px;">
      <div style="background: #fff7ed; border: 1px solid #fed7aa; border-radius: 8px; padding: 10px 16px; margin-bottom: 16px; display: inline-block;">
        <span style="font-size: 15px; font-weight: 700; color: #ff4500;">r/${sub}</span>
        <span style="font-size: 12px; color: #b45309; margin-left: 8px;">${posts.length} opportunit${posts.length === 1 ? "y" : "ies"}</span>
      </div>
      ${posts.map((c, i) => `
        <div style="border: 1px solid #e5e7eb; border-radius: 10px; padding: 20px; margin-bottom: 16px; background: #fff;">
          <!-- Post number + badges -->
          <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 10px; flex-wrap: wrap;">
            <span style="background: #111827; color: white; font-size: 11px; font-weight: 700; padding: 2px 8px; border-radius: 4px;">#${i + 1}</span>
            <span style="background: ${c.safetyScore >= 80 ? "#f0fdf4" : "#fefce8"}; color: ${c.safetyScore >= 80 ? "#16a34a" : "#ca8a04"}; border: 1px solid ${c.safetyScore >= 80 ? "#bbf7d0" : "#fde68a"}; font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: 4px;">Safety ${c.safetyScore}/100</span>
            <span style="background: #f3f4f6; color: #6b7280; font-size: 11px; padding: 2px 8px; border-radius: 4px;">Promotion: ${c.promotionLevel}</span>
          </div>

          <!-- Post title -->
          <a href="${c.postUrl}" style="display: block; font-size: 15px; font-weight: 600; color: #111827; text-decoration: none; margin-bottom: 4px; line-height: 1.5;">${c.postTitle}</a>
          <a href="${c.postUrl}" style="font-size: 12px; color: #9ca3af; text-decoration: none; display: block; margin-bottom: 14px;">${c.postUrl}</a>

          <!-- Divider -->
          <div style="border-top: 1px solid #f3f4f6; margin-bottom: 14px;"></div>

          <!-- Comment label -->
          <p style="margin: 0 0 6px; font-size: 11px; font-weight: 700; color: #9ca3af; text-transform: uppercase; letter-spacing: 0.05em;">Suggested Comment</p>

          <!-- Comment box -->
          <div style="background: #f9fafb; border-left: 3px solid #ff4500; padding: 14px 16px; border-radius: 0 8px 8px 0; margin-bottom: 12px;">
            <p style="margin: 0; font-size: 14px; color: #374151; line-height: 1.7; white-space: pre-wrap;">${c.comment}</p>
          </div>

          ${c.keywordsUsed?.length ? `<p style="margin: 0 0 12px; font-size: 12px; color: #9ca3af;">Keywords used: <strong style="color: #6b7280;">${c.keywordsUsed.join(", ")}</strong></p>` : ""}
          ${c.safetyNotes ? `<p style="margin: 0 0 12px; font-size: 12px; color: #9ca3af;">Safety notes: ${c.safetyNotes}</p>` : ""}

          <!-- CTA -->
          <a href="${c.postUrl}" style="display: inline-block; background: #ff4500; color: white; text-decoration: none; font-size: 13px; font-weight: 600; padding: 8px 18px; border-radius: 7px;">Open Post on Reddit →</a>
        </div>
      `).join("")}
    </div>
  `).join("");

  const toc = Object.entries(bySubreddit).map(([sub, posts]) =>
    `<tr><td style="padding: 6px 0; font-size: 13px; color: #374151;">r/${sub}</td><td style="padding: 6px 0; font-size: 13px; color: #6b7280; text-align: right;">${posts.length} post${posts.length !== 1 ? "s" : ""}</td></tr>`
  ).join("");

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin: 0; padding: 0; background: #f3f4f6; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">
<div style="max-width: 720px; margin: 0 auto; padding: 32px 16px;">
<div style="background: white; border-radius: 16px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">

  <!-- Header -->
  <div style="background: #ff4500; padding: 28px 36px;">
    <h1 style="margin: 0 0 6px; color: white; font-size: 22px; font-weight: 800;">Reddit Engagement Report</h1>
    <p style="margin: 0; color: rgba(255,255,255,0.85); font-size: 14px;">${comments.length} comment opportunities · ${timeframe} · Generated ${runAt}</p>
  </div>

  <!-- Business summary -->
  <div style="padding: 20px 36px; background: #fff7ed; border-bottom: 1px solid #fed7aa;">
    <p style="margin: 0 0 4px; font-size: 12px; font-weight: 700; color: #b45309; text-transform: uppercase; letter-spacing: 0.05em;">Business</p>
    <p style="margin: 0; font-size: 14px; color: #92400e;">${business}</p>
  </div>

  <!-- Table of contents -->
  <div style="padding: 24px 36px; border-bottom: 1px solid #e5e7eb;">
    <p style="margin: 0 0 12px; font-size: 13px; font-weight: 700; color: #111827;">Contents</p>
    <table style="width: 100%; border-collapse: collapse;">
      <tr style="border-bottom: 1px solid #f3f4f6;">
        <td style="padding: 6px 0; font-size: 13px; font-weight: 600; color: #374151;">Subreddit</td>
        <td style="padding: 6px 0; font-size: 13px; font-weight: 600; color: #374151; text-align: right;">Posts</td>
      </tr>
      ${toc}
      <tr style="border-top: 2px solid #e5e7eb;">
        <td style="padding: 8px 0; font-size: 13px; font-weight: 700; color: #111827;">Total</td>
        <td style="padding: 8px 0; font-size: 13px; font-weight: 700; color: #ff4500; text-align: right;">${comments.length}</td>
      </tr>
    </table>
    <p style="margin: 12px 0 0; font-size: 12px; color: #9ca3af;">Review each comment below, personalise if needed, then paste directly on Reddit. Always read the full thread before commenting.</p>
  </div>

  <!-- Main content -->
  <div style="padding: 32px 36px;">
    ${sections}
  </div>

  <!-- Footer -->
  <div style="padding: 20px 36px; background: #f9fafb; border-top: 1px solid #e5e7eb; text-align: center;">
    <p style="margin: 0; font-size: 12px; color: #9ca3af;">Generated by Reddit Marketing Agent · Always review before posting · Never spam</p>
  </div>

</div>
</div>
</body>
</html>`;
}
