import { NextResponse } from "next/server";

function cleanApiKey(value: string) {
  return value.replace(/^Bearer\s+/i, "").trim();
}

function keyTail(value: string) {
  return cleanApiKey(value).slice(-6);
}

export async function POST(request: Request) {
  const keyFromHeader = request.headers.get("x-kimi-api-key") || "";
  const apiKey = cleanApiKey(keyFromHeader || process.env.KIMI_CODING_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN || "");

  if (!apiKey) {
    return NextResponse.json({ ok: false, error: "还没有填写访问码。" }, { status: 400 });
  }

  const response = await fetch("https://api.kimi.com/coding/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: process.env.KIMI_MODEL || process.env.ANTHROPIC_MODEL || "K2.6",
      max_tokens: 32,
      messages: [{ role: "user", content: "只回答 OK" }],
    })
  });

  if (!response.ok) {
    const message = await response.text();
    const invalid = response.status === 401 || message.includes("Invalid Authentication");
    return NextResponse.json(
      {
        ok: false,
        keyTail: keyTail(apiKey),
        error: invalid ? "访问码不可用，请重新填写。" : "暂时无法开启智能分析，请稍后再试。"
      },
      { status: response.status }
    );
  }

  return NextResponse.json({ ok: true, keyTail: keyTail(apiKey) });
}
