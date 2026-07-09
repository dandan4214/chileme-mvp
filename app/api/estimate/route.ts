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
  "5. 热量和营养估算优先根据食物类型、份量描述、常见单人份和烹饪方式判断；没有份量时按普通一人份估算。" +
  "6. 个人身高、体重、年龄、性别和目标只用于判断建议是否更适合此人，不用于凭空改变本餐客观热量。" +
  "7. 营养估算以整餐为单位：calories 为千卡，protein/carbs/fat 为克，vegetableRatio 为蔬菜占整餐体积的大致百分比。" +
  "8. verdict 用一句中文，轻量、日常、可执行。" +
  "9. 必须输出严格 JSON，不要 Markdown，不要额外解释。";

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

const fallbackFoodRules: Array<Recognition & { aliases: string[] }> = [
  {
    aliases: ["蛋炒饭", "炒饭"],
    foods: ["蛋炒饭"],
    calories: 620,
    protein: 18,
    carbs: 92,
    fat: 20,
    vegetableRatio: 8,
    verdict: ""
  },
  {
    aliases: ["无糖豆浆", "豆浆"],
    foods: ["无糖豆浆"],
    calories: 100,
    protein: 7,
    carbs: 7,
    fat: 4,
    vegetableRatio: 0,
    verdict: ""
  },
  {
    aliases: ["番茄炒蛋", "西红柿炒鸡蛋"],
    foods: ["番茄炒蛋"],
    calories: 260,
    protein: 14,
    carbs: 12,
    fat: 17,
    vegetableRatio: 45,
    verdict: ""
  },
  {
    aliases: ["米饭"],
    foods: ["米饭"],
    calories: 180,
    protein: 4,
    carbs: 40,
    fat: 1,
    vegetableRatio: 0,
    verdict: ""
  },
  {
    aliases: ["青菜", "绿叶菜", "蔬菜"],
    foods: ["青菜"],
    calories: 80,
    protein: 3,
    carbs: 10,
    fat: 3,
    vegetableRatio: 90,
    verdict: ""
  },
  {
    aliases: ["鸡胸", "鸡胸肉"],
    foods: ["鸡胸肉"],
    calories: 220,
    protein: 38,
    carbs: 0,
    fat: 6,
    vegetableRatio: 0,
    verdict: ""
  }
];

function buildFallbackRecognition(input: string): Recognition {
  const matched = fallbackFoodRules.filter((rule) => rule.aliases.some((alias) => input.includes(alias)));
  if (!matched.length) {
    return {
      foods: [input.length > 18 ? `${input.slice(0, 18)}...` : input || "未确认餐食"],
      calories: 500,
      protein: 18,
      carbs: 65,
      fat: 18,
      vegetableRatio: 15,
      verdict: "已按常见单人份做保守估算，建议确认菜品和份量后再生成记录。"
    };
  }

  const totals = matched.reduce(
    (acc, item) => {
      acc.calories += item.calories;
      acc.protein += item.protein;
      acc.carbs += item.carbs;
      acc.fat += item.fat;
      acc.vegetableRatio += item.vegetableRatio;
      return acc;
    },
    { calories: 0, protein: 0, carbs: 0, fat: 0, vegetableRatio: 0 }
  );

  return {
    foods: matched.flatMap((item) => item.foods),
    calories: totals.calories,
    protein: totals.protein,
    carbs: totals.carbs,
    fat: totals.fat,
    vegetableRatio: Math.round(totals.vegetableRatio / matched.length),
    verdict: "已按常见单人份做保守估算，实际热量会随份量和用油量变化。"
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

  try {
    const data = await response.json();
    const text = extractAssistantText(data);
    return NextResponse.json({ result: normalizeRecognition(extractJson(text)) });
  } catch {
    return NextResponse.json({ result: buildFallbackRecognition(input) });
  }
}
