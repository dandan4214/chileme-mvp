import { NextResponse } from "next/server";
import { enforceRateLimit } from "../_lib/rate-limit";

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
  "5. 热量和营养估算优先根据食物类型、份量描述、常见单人份和烹饪方式判断；没有份量时按普通一人份估算。" +
  "6. 个人身高、体重、年龄、性别和目标只用于判断建议是否更适合此人，不用于凭空改变本餐客观热量。" +
  "7. 营养估算以整餐为单位：calories 为千卡，protein/carbs/fat 为克，vegetableRatio 为蔬菜占整餐体积的大致百分比。" +
  "8. 个人背景如包含过敏原或忌口，verdict 和后续建议必须尊重这些限制，但不能因此篡改本餐识别事实。" +
  "9. verdict 用一句中文，轻量、日常、可执行。" +
  "10. 必须输出严格 JSON，不要 Markdown，不要额外解释。";

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

function extractAssistantText(data: unknown) {
  const value = data as {
    content?: unknown;
    choices?: Array<{ message?: { content?: unknown }; text?: unknown }>;
    completion?: unknown;
  };

  if (Array.isArray(value.content)) {
    return value.content
      .filter((part): part is { type?: string; text?: string } => Boolean(part) && typeof part === "object")
      .filter((part) => !part.type || part.type === "text")
      .map((part) => part.text || "")
      .join("\n");
  }

  if (typeof value.content === "string") {
    return value.content;
  }

  const firstChoice = value.choices?.[0];
  if (typeof firstChoice?.message?.content === "string") {
    return firstChoice.message.content;
  }
  if (typeof firstChoice?.text === "string") {
    return firstChoice.text;
  }
  if (typeof value.completion === "string") {
    return value.completion;
  }

  return "";
}

export async function POST(request: Request) {
  const limited = enforceRateLimit(request, "estimate", { limit: 20, windowMs: 10 * 60 * 1000 });
  if (limited) return limited;

  const { description, foods, portion, baseEstimate, profileContext } = (await request.json()) as {
    description?: string;
    foods?: string[];
    portion?: "small" | "regular" | "large";
    baseEstimate?: Recognition;
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

  const portionLabels = {
    small: "少量，大约常规一人份的二分之一",
    regular: "正常量，大约常规一人份",
    large: "较多，大约常规一人份的一点五倍"
  } as const;
  const portionContext = portion ? portionLabels[portion] : "用户没有额外确认份量，请根据描述判断";

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
      thinking: { type: "disabled" },
      system: DIET_AGENT_SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content:
            `用户长期背景：${profileContext?.trim() || "用户暂未填写个人饮食背景。"}\n` +
            `用户描述：${input}\n` +
            `用户确认的实际进食份量：${portionContext}\n` +
            `上一次估算（只作重新估算时的上下文，不得机械乘倍数）：${baseEstimate ? JSON.stringify(baseEstimate) : "无"}\n` +
            "请结合长期背景生成更贴近用户目标的轻量评价，但营养估算仍以本餐实际描述为主。" +
            "如果用户确认了份量，必须基于菜品、烹饪方式和该份量重新估算整餐，不要只对上一次数字机械乘倍数。" +
            "请返回 JSON：foods:string[] 菜品名称；calories:number 千卡；protein:number 克；carbs:number 克；fat:number 克；vegetableRatio:number 0-100；verdict:string 一句轻量饮食评价。"
        }
      ]
    })
  });

  if (!response.ok) {
    return NextResponse.json({ error: "这次分析没有成功，请稍后再试。" }, { status: response.status });
  }

  try {
    const data = await response.json();
    const text = extractAssistantText(data);
    return NextResponse.json({ result: normalizeRecognition(extractJson(text)) });
  } catch {
    return NextResponse.json({ error: "这次营养估算没有整理完整，请再试一次。" }, { status: 502 });
  }
}
