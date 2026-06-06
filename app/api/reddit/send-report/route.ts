import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";

export async function POST(req: NextRequest) {
  try {
    const { email, businessDescription, comments, subreddits } = await req.json();
    if (!email || !comments?.length) return NextResponse.json({ error: "Email and comments are required" }, { status: 400 });

    const safetyColor = (s: number) => s >= 85 ? "#16a34a" : s >= 60 ? "#d97706" : "#dc2626";
    const promotionColor = (l: string) => ({ none: "#6b7280", subtle: "#0891b2", moderate: "#7c3aed" }[l] || "#6b7280");

    const commentsHtml = comments.map((c: GeneratedComment) => `
      <div style="border:1px solid #e5e7eb;border-radius:8px;padding:20px;margin-bottom:20px;background:#fff;">
        <span style="font-size:12px;color:#ff4500;font-weight:600;">r/${c.subreddit}</span>
        <h3 style="margin:4px 0 8px;font-size:15px;color:#1f2937;">${c.postTitle}</h3>
        <span style="display:inline-block;padding:2px 8px;border-radius:12px;font-size:11px;font-weight:600;color:#fff;background:${safetyColor(c.safetyScore)};margin-right:6px;">Safety: ${c.safetyScore}%</span>
        <span style="display:inline-block;padding:2px 8px;border-radius:12px;font-size:11px;font-weight:600;color:#fff;background:${promotionColor(c.promotionLevel)};">${c.promotionLevel} promotion</span>
        <div style="background:#f9fafb;border-left:3px solid #ff4500;padding:12px 16px;border-radius:4px;margin:12px 0;">
          <p style="margin:0;font-size:14px;color:#374151;line-height:1.6;">${c.comment.replace(/\n/g, "<br>")}</p>
        </div>
        <p style="margin:4px 0;font-size:11px;color:#9ca3af;">${c.safetyNotes}</p>
        <a href="${c.postUrl}" style="font-size:12px;color:#ff4500;">View Post →</a>
      </div>`).join("");

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="font-family:sans-serif;background:#f3f4f6;margin:0;padding:24px;">
  <div style="max-width:720px;margin:0 auto;">
    <div style="background:#ff4500;border-radius:12px 12px 0 0;padding:24px 32px;color:#fff;">
      <h1 style="margin:0 0 8px;font-size:22px;">Reddit Marketing Report</h1>
      <p style="margin:0;opacity:0.9;font-size:14px;">Business: ${businessDescription}</p>
    </div>
    <div style="background:#fff;padding:24px 32px;border-bottom:1px solid #e5e7eb;">
      <p style="margin:0;color:#374151;"><strong>${subreddits?.length || 0}</strong> subreddits &nbsp; <strong>${comments.length}</strong> comments &nbsp; <strong>${comments.filter((c: GeneratedComment) => c.safetyScore >= 85).length}</strong> high safety</p>
    </div>
    <div style="background:#fff;padding:24px 32px;border-radius:0 0 12px 12px;">
      <h2 style="margin:0 0 20px;font-size:18px;color:#1f2937;">Prepared Comments</h2>
      ${commentsHtml}
      <div style="margin-top:24px;padding:16px;background:#fff7ed;border:1px solid #fed7aa;border-radius:8px;">
        <p style="margin:0;font-size:13px;color:#9a3412;"><strong>Before posting:</strong> Review each comment, check subreddit rules, and space posts over several days.</p>
      </div>
    </div>
  </div>
</body></html>`;

    const resend = new Resend(process.env.RESEND_API_KEY);
    await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL || "marketing@yourdomain.com",
      to: email,
      subject: `Reddit Marketing Report — ${comments.length} comments ready`,
      html,
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("send-report error:", err);
    return NextResponse.json({ error: "Failed to send report" }, { status: 500 });
  }
}

interface GeneratedComment { postUrl: string; postTitle: string; subreddit: string; comment: string; keywordsUsed: string[]; promotionLevel: string; safetyScore: number; safetyNotes: string; }
