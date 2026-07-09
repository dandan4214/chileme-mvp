import { NextResponse } from "next/server";

type Recognition = {
  foods: string[];
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  vegetableRatio: number;
  verdict: string;
};

const DIET_AGENT_SYSTEM_PROMPT =
  "你是“吃了么”的饮食 Agent，职责是把用户的文字描述转成结构化饮食记录。" +
  "工作规则：1. 只做日常饮食记录和轻量饮食建议，不做医疗诊断，不给疾病治疗建议。" +
  "2. 用户通常不知道精确克重，你需要结合中文餐饮常见份量做合理估算，并承认这是估算。" +
  "3. 只基于用户明确描述的内容，不要凭空添加未提到的食物。" +
  "4. 如果描述含糊，用更泛化的菜品名，并保守估算。" +
  "5. 营养估算以整餐为单位：calories 为千卡，protein/carbs/fat 为克，vegetableRatio 为蔬菜占整餐体积的大致百分比。" +
  "6. verdict 用一句中文，轻量、日常、可执行。" +
  "7. 必须输出严格 JSON，不要 Markdown，不要额外解释。";

function cleanApiKey(value: string) {
  return value.replace(/^Bearer\s+/i, "").trim();
}

function normalizeRecognition(value: Partial<Recognition>): Recognition {
  return {
    foods: Array.isArray(value.foods) && value.foods.length ? value.foods.map(String) : ["未确认餐食"],
    calories: Math.max(0, Math.round(Number(value.calories) || 0)),
    protein: Math.max(0, Math.round(Number(value.protein) || 0)),
    carbs: Math.max(0, Math.round(Number(value.carbs) || 0)),
    fat: Math.max(0, Math.round(Number(value.fat) || 0)),
    vegetableRatio: Math.min(Math.max(Math.round(Number(value.vegetableRatio) || 0), 0), 100),
    verdict: String(value.verdict || "已根据描述估算营养结构，建议用户确认菜品是否准确。")
  };
}

function extractJson(text: string) {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) {
    throw new Error("Kimi response did not contain JSON");
  }
  return JSON.parse(match[0]) as Partial<Recognition>;
}

export async function POST(request: Request) {
  const { description, foods, profileContext } = (await request.json()) as {
    description?: string;
    foods?: string[];
    profileContext?: string;
  };
  const input = description?.trim() || foods?.join("、") || "";

  if (!input) {
    return NextResponse.json({ error: "请先输入吃了什么。" }, { status: 400 });
  }

  const keyFromHeader = request.headers.get("x-kimi-api-key") || "";
  const apiKey = cleanApiKey(keyFromHeader || process.env.KIMI_CODING_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN || "");

  if (!apiKey) {
    return NextResponse.json({ error: "智能分析暂时不可用，请稍后再试或检查是否已开启。" }, { status: 503 });
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
      max_tokens: 1000,
      system: DIET_AGENT_SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content:
            `用户长期背景：${profileContext?.trim() || "用户暂未填写个人饮食背景。"}\n` +
            `用户描述：${input}\n` +
            "请结合长期背景生成更贴近用户目标的轻量评价，但营养估算仍以本餐实际描述为主。" +
            "请返回 JSON：foods:string[] 菜品名称；calories:number 千卡；protein:number 克；carbs:number 克；fat:number 克；vegetableRatio:number 0-100；verdict:string 一句轻量饮食评价。"
        }
      ]
    })
  });

  if (!response.ok) {
    return NextResponse.json({ error: "这次分析没有成功，请稍后再试。" }, { status: response.status });
  }

  const data = await response.json();
  const text = Array.isArray(data?.content)
    ? data.content
        .filter((part: { type?: string }) => part?.type === "text")
        .map((part: { text?: string }) => part.text || "")
        .join("\n")
    : "";

  return NextResponse.json({ result: normalizeRecognition(extractJson(text)) });
}
