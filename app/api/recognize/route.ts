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
  "你是“吃了么”的饮食 Agent，职责是把餐食图片或描述转成结构化饮食记录。" +
  "工作规则：1. 只做日常饮食记录和轻量饮食建议，不做医疗诊断，不给疾病治疗建议。" +
  "2. 必须先扫描整张图片，在画面任何位置主动寻找食物区域；即使食物只占局部、旁边有人物、餐具、桌椅或其他环境，也要忽略无关内容并识别可见食物。" +
  "3. 先识别菜品，再结合常见份量估算热量和营养，不要假装精确测量。只基于图片中可见内容，不要凭空添加未出现的食物。" +
  "4. 如果不确定菜名，用“疑似...”或更泛化的菜品名。" +
  "5. 热量和营养估算优先根据可见份量、食物类型、常见单人份和烹饪方式判断；看不清份量时按普通一人份保守估算。" +
  "6. 个人身高、体重、年龄、性别和目标只用于判断建议是否更适合此人，不用于凭空改变本餐客观热量。" +
  "7. 营养估算以整餐为单位：calories 为千卡，protein/carbs/fat 为克，vegetableRatio 为蔬菜占整餐体积的大致百分比。" +
  "8. verdict 用一句中文，轻量、日常、可执行，避免恐吓式表达。" +
  "9. 个人背景如包含过敏原或忌口，verdict 必须提醒相关风险，但不能因此篡改图片中的餐食事实。" +
  "10. 如果确认整张图没有明确食物，返回 foods:[\"未发现明确食物\"]，所有营养数值为 0，并在 verdict 中请用户换图或用文字描述。" +
  "11. 必须只输出严格 JSON，不要输出识别过程、Markdown 或额外解释。";

const RECOGNITION_JSON_INSTRUCTION =
  "返回 JSON：foods:string[] 菜品名称；calories:number 千卡；protein:number 克；carbs:number 克；fat:number 克；vegetableRatio:number 取 0-100 的整数百分比，例如 15% 必须返回 15，禁止返回 0.15；verdict:string 一句轻量饮食评价。";

function normalizeRecognition(value: Partial<Recognition>): Recognition {
  const rawVegetableRatio = Number(value.vegetableRatio) || 0;
  const normalizedVegetableRatio = rawVegetableRatio > 0 && rawVegetableRatio <= 1
    ? rawVegetableRatio * 100
    : rawVegetableRatio;

  return {
    foods: Array.isArray(value.foods) && value.foods.length ? value.foods.map(String) : ["未确认餐食"],
    calories: Math.max(0, Math.round(Number(value.calories) || 0)),
    protein: Math.max(0, Math.round(Number(value.protein) || 0)),
    carbs: Math.max(0, Math.round(Number(value.carbs) || 0)),
    fat: Math.max(0, Math.round(Number(value.fat) || 0)),
    vegetableRatio: Math.min(Math.max(Math.round(normalizedVegetableRatio), 0), 100),
    verdict: String(value.verdict || "识别结果需要用户确认后再生成饮食记录。")
  };
}

function extractJson(text: string) {
  const cleaned = text.replace(/```json/gi, "").replace(/```/g, "").trim();
  const match = cleaned.match(/\{[\s\S]*\}/);
  if (!match) {
    throw new Error("Kimi response did not contain JSON");
  }
  const candidate = match[0].replace(/,\s*([}\]])/g, "$1");
  return JSON.parse(candidate) as Partial<Recognition>;
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

function cleanApiKey(value: string) {
  return value.replace(/^Bearer\s+/i, "").trim();
}

function getKeyTail(value: string) {
  const cleaned = cleanApiKey(value);
  return cleaned ? cleaned.slice(-6) : "";
}

function parseDataUrl(dataUrl: string) {
  const match = dataUrl.match(/^data:(.+);base64,(.*)$/);
  if (!match) {
    throw new Error("Invalid image data URL");
  }
  return {
    mediaType: match[1],
    data: match[2]
  };
}

async function callKimiCoding({
  apiKey,
  imageDataUrl,
  model,
  profileContext
}: {
  apiKey: string;
  imageDataUrl: string;
  model: string;
  profileContext: string;
}) {
  const image = parseDataUrl(imageDataUrl);

  return fetch("https://api.kimi.com/coding/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      max_tokens: 1000,
      thinking: { type: "disabled" },
      system: DIET_AGENT_SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: image.mediaType,
                data: image.data
              }
            },
            {
              type: "text",
              text:
                `用户长期背景：${profileContext || "用户暂未填写个人饮食背景。"}\n` +
                "请先查看整张图片并定位其中所有可见食物。食物可能只占图片的一小部分，不要因为人物、餐具、桌面、餐厅环境或其他物品占据大部分画面而放弃识别。" +
                `按可见食物和常见份量估算营养。结合长期背景生成更贴近用户目标的轻量评价，但不要为了迎合目标而改变本餐事实。${RECOGNITION_JSON_INSTRUCTION}`
            }
          ]
        }
      ]
    })
  });
}

export async function POST(request: Request) {
  const limited = enforceRateLimit(request, "recognize", { limit: 12, windowMs: 10 * 60 * 1000 });
  if (limited) return limited;

  const { imageDataUrl, profileContext } = (await request.json()) as { imageDataUrl?: string; profileContext?: string };
  if (!imageDataUrl) {
    return NextResponse.json({ error: "缺少图片数据" }, { status: 400 });
  }

  const keyFromHeader = request.headers.get("x-kimi-api-key") || "";
  const browserKey = cleanApiKey(keyFromHeader);
  const envKey = cleanApiKey(process.env.KIMI_CODING_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN || "");
  const model = process.env.KIMI_MODEL || process.env.ANTHROPIC_MODEL || "K2.6";
  const keyCandidates = browserKey
    ? [{ source: "browser" as const, key: browserKey }]
    : envKey
      ? [{ source: "env" as const, key: envKey }]
      : [];

  if (!keyCandidates.length) {
    return NextResponse.json(
      {
        code: "MISSING_API_KEY",
        error: "智能分析暂时不可用，请稍后再试或检查是否已开启。"
      },
      { status: 503 }
    );
  }

  let response: Response | null = null;
  let responseText = "";
  let usedKey = keyCandidates[0];

  for (const candidate of keyCandidates) {
    usedKey = candidate;
    response = await callKimiCoding({
      apiKey: candidate.key,
      imageDataUrl,
      model,
      profileContext: profileContext?.trim() || ""
    });
    if (response.ok) break;
    responseText = await response.text();
    const isInvalidAuth = response.status === 401 || responseText.includes("Invalid Authentication");
    if (!isInvalidAuth) break;
  }

  if (!response?.ok) {
    const isInvalidAuth = response?.status === 401 || responseText.includes("Invalid Authentication");
    return NextResponse.json(
      {
        code: isInvalidAuth ? "INVALID_API_KEY" : "KIMI_API_ERROR",
        error: isInvalidAuth ? "访问码不可用，请重新开启智能分析。" : "这次图片分析没有成功，请稍后再试。",
        keySource: usedKey.source,
        keyTail: getKeyTail(usedKey.key)
      },
      { status: response?.status || 500 }
    );
  }

  let parsed: Partial<Recognition>;
  try {
    const data = await response.json();
    parsed = extractJson(extractAssistantText(data));
  } catch {
    return NextResponse.json(
      {
        code: "KIMI_RESPONSE_PARSE_ERROR",
        error: "这次图片分析返回格式不稳定，请再试一次。",
        keySource: usedKey.source,
        keyTail: getKeyTail(usedKey.key)
      },
      { status: 502 }
    );
  }

  return NextResponse.json({
    mode: "kimi",
    model,
    keySource: usedKey.source,
    result: normalizeRecognition(parsed)
  });
}
