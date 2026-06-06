import { NextRequest, NextResponse } from "next/server";

async function getAccessToken(): Promise<string> {
  const clientId = process.env.REDDIT_CLIENT_ID;
  const clientSecret = process.env.REDDIT_CLIENT_SECRET;
  const refreshToken = process.env.REDDIT_REFRESH_TOKEN;
  if (!clientId || !clientSecret || !refreshToken) throw new Error("Reddit OAuth credentials not configured");

  const res = await fetch("https://www.reddit.com/api/v1/access_token", {
    method: "POST",
    headers: { Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`, "Content-Type": "application/x-www-form-urlencoded", "User-Agent": "RedditMarketingApp/1.0" },
    body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken }),
  });
  if (!res.ok) throw new Error("Failed to get Reddit access token");
  return (await res.json()).access_token;
}

export async function POST(req: NextRequest) {
  try {
    const { postId, comment } = await req.json();
    if (!postId || !comment) return NextResponse.json({ error: "postId and comment are required" }, { status: 400 });

    const accessToken = await getAccessToken();
    const res = await fetch("https://oauth.reddit.com/api/comment", {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/x-www-form-urlencoded", "User-Agent": "RedditMarketingApp/1.0" },
      body: new URLSearchParams({ api_type: "json", thing_id: `t3_${postId}`, text: comment }),
    });

    const data = await res.json();
    if (data?.json?.errors?.length > 0) return NextResponse.json({ error: data.json.errors[0][1] || "Reddit API error" }, { status: 400 });
    return NextResponse.json({ success: true, commentId: data?.json?.data?.things?.[0]?.data?.id });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to post comment";
    if (message.includes("not configured")) return NextResponse.json({ error: message, setupRequired: true }, { status: 503 });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
