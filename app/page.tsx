"use client";

import {
  Activity,
  CalendarDays,
  Check,
  ChevronRight,
  Clock3,
  ClipboardList,
  CookingPot,
  Edit3,
  ImagePlus,
  Loader2,
  Mic,
  NotebookPen,
  Salad,
  Soup,
  UserRound,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  ShieldCheck,
  Trash2,
  Utensils,
  X
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { ChangeEvent, CSSProperties, useEffect, useMemo, useRef, useState } from "react";
import styles from "./page.module.css";

type MealSlot = "早餐" | "午餐" | "晚餐" | "加餐";
type MealScene = "点外卖" | "到店吃" | "自己做";
type MealIntent = "均衡一点" | "健身补充" | "减脂控制" | "就是要放纵！！！";
type MealTarget = "早餐" | "午餐" | "晚餐" | "下一顿正餐";
type PortionSize = "small" | "regular" | "large";

type Recognition = {
  foods: string[];
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  vegetableRatio: number;
  verdict: string;
};

type MealRecord = Recognition & {
  id: string;
  slot: MealSlot;
  createdAt: string;
  portion?: PortionSize;
};

type UserProfile = {
  name: string;
  height: string;
  weight: string;
  age: string;
  gender: string;
  activityLevel: string;
  goal: string;
  needs: string[];
  customNeed: string;
  allergies: string;
  avoidedFoods: string;
};

type ObservationRange = "week" | "month";
type RecognitionStage = "idle" | "uploading" | "recognizing" | "returning";
type AppTab = "record" | "today" | "observe" | "next" | "profile";
type NextMealMenu = {
  category: string;
  name: string;
  detail: string;
};
type NextMealIdea = {
  title: string;
  tip: string;
  menus: NextMealMenu[];
};
type PeriodInsight = {
  title: string;
  body: string;
};
type NutritionGap = {
  title: string;
  body: string;
  categories: string[];
};

type SpeechRecognitionConstructor = new () => {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: { results: ArrayLike<{ 0: { transcript: string } }> }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start: () => void;
  stop: () => void;
};

type SpeechWindow = Window &
  typeof globalThis & {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };

const mealSlots: MealSlot[] = ["早餐", "午餐", "晚餐", "加餐"];
const mealScenes: MealScene[] = ["点外卖", "到店吃", "自己做"];
const mealIntents: MealIntent[] = ["均衡一点", "健身补充", "减脂控制", "就是要放纵！！！"];
const portionOptions: Array<{ value: PortionSize; label: string; hint: string }> = [
  { value: "small", label: "少量", hint: "大约半份" },
  { value: "regular", label: "正常", hint: "常规一人份" },
  { value: "large", label: "较多", hint: "约一份半" }
];
const needOptions = ["最近在健身", "最近想减肥", "想少油清淡", "想规律吃饭", "想多补蛋白", "控制夜宵", "偶尔安排放松餐"];
const NEXT_MEAL_CACHE_KEY = "chileme-next-meal-cache-v3";
const RECOMMENDATION_HISTORY_KEY = "chileme-recommendation-history-v2";

const emptyProfile: UserProfile = {
  name: "",
  height: "",
  weight: "",
  age: "",
  gender: "未设置",
  activityLevel: "日常活动",
  goal: "保持均衡",
  needs: [],
  customNeed: "",
  allergies: "",
  avoidedFoods: ""
};

const fallbackMenuPools = {
  breakfastOutside: [
    { category: "中式早餐", name: "鸡蛋豆浆套餐", detail: "豆浆选无糖，主食保持小份" },
    { category: "西式早餐", name: "鸡蛋早餐堡", detail: "搭牛奶或无糖咖啡，不加薯饼" },
    { category: "面包轻食", name: "早餐帕尼尼", detail: "搭牛奶，再补一份水果" },
    { category: "中式快餐", name: "蒸蛋早餐套餐", detail: "粥选小份，搭鸡蛋和青菜" },
    { category: "便利店早餐", name: "饭团鸡蛋组合", detail: "选配料清楚的饭团，搭无糖饮料" },
    { category: "便利店轻食", name: "三明治牛奶组合", detail: "优先鸡蛋或鸡肉三明治" }
  ],
  breakfastHome: [
    { category: "", name: "鸡蛋燕麦牛奶", detail: "一个鸡蛋，一碗燕麦牛奶，配一份水果" },
    { category: "", name: "全麦三明治", detail: "鸡蛋和生菜夹全麦面包，搭无糖豆浆" },
    { category: "", name: "杂粮粥配蒸蛋", detail: "一小碗杂粮粥，一份蒸蛋，加凉拌蔬菜" },
    { category: "", name: "玉米鸡蛋豆浆", detail: "一根玉米，一个鸡蛋，一杯无糖豆浆" },
    { category: "", name: "鸡丝汤面", detail: "面条小份，鸡丝一掌心，多加青菜" },
    { category: "", name: "红薯酸奶坚果", detail: "一小块红薯，原味酸奶，坚果少量" }
  ],
  takeaway: [
    { category: "中式快餐", name: "蒸鸡套餐", detail: "小份米饭，加一份时蔬，酱汁少放" },
    { category: "牛肉饭", name: "牛肉蔬菜饭", detail: "饭选小份，蔬菜加量，不配甜饮" },
    { category: "蒸菜简餐", name: "蒸排骨套餐", detail: "米饭吃七成，额外加一份青菜" },
    { category: "杂粮简餐", name: "鸡肉杂粮饭", detail: "酱汁分装，搭配清爽蔬菜" },
    { category: "麻辣烫", name: "自选清汤麻辣烫", detail: "多选蔬菜豆制品，主食只选一种" },
    { category: "麻辣烫", name: "番茄汤麻辣烫", detail: "少丸子，多青菜和瘦肉，汤少喝" },
    { category: "西式快餐", name: "板烧鸡腿堡", detail: "搭玉米杯和无糖饮料，不加薯条" },
    { category: "西式快餐", name: "烤鸡汉堡套餐", detail: "搭蔬菜或玉米，不配含糖饮料" },
    { category: "家常菜外卖", name: "小炒肉套餐", detail: "米饭小份，加一份绿叶菜" }
  ],
  dineIn: [
    { category: "汤面馆", name: "牛肉汤面", detail: "青菜加量，面吃七成，汤少喝" },
    { category: "中式快餐", name: "鸡肉套餐", detail: "米饭小份，再配一份当季时蔬" },
    { category: "中式简餐", name: "鸡肉饭", detail: "饭量减半，搭青菜和无糖豆浆" },
    { category: "火锅", name: "番茄锅涮菜组合", detail: "多选蔬菜豆制品和瘦肉，少蘸料" },
    { category: "烧烤", name: "烤肉蔬菜组合", detail: "肉串适量，多点烤蔬菜，不配甜饮" },
    { category: "西北菜", name: "牛肉蔬菜组合", detail: "主食小份，优先清淡牛肉和时蔬" },
    { category: "酸菜鱼", name: "酸菜鱼配青菜", detail: "鱼肉适量，米饭小份，汤少喝" },
    { category: "家常菜", name: "家常小炒组合", detail: "一荤一素，主食按需，少选油炸" },
    { category: "江浙菜", name: "烤鸡配时蔬", detail: "多人分享，给自己留一掌心肉量" }
  ],
  home: [
    { category: "", name: "番茄炒蛋配青菜", detail: "两个鸡蛋，一盘青菜，米饭半碗" },
    { category: "", name: "冬瓜虾仁炖豆腐", detail: "虾仁一掌心，豆腐半盒，少油炖煮" },
    { category: "", name: "青椒牛肉配菌菇汤", detail: "牛肉一掌心，青椒加量，主食小份" },
    { category: "", name: "香菇鸡腿焖饭", detail: "鸡腿去皮，米饭适量，多加香菇青菜" },
    { category: "", name: "清蒸鱼配炒时蔬", detail: "鱼肉一掌心，两拳蔬菜，米饭半碗" },
    { category: "", name: "芹菜豆干炒肉", detail: "瘦肉少量，豆干适量，芹菜加量" },
    { category: "", name: "萝卜牛腩煲", detail: "牛腩一掌心，萝卜加量，少油炖煮" },
    { category: "", name: "家常鸡丝凉面", detail: "面条一小碗，鸡丝和黄瓜多一些" }
  ]
} satisfies Record<string, NextMealMenu[]>;

function getDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function parseFoods(value: string) {
  return value
    .split(/[、,，\n]/)
    .map((food) => food.trim())
    .filter(Boolean);
}

function calcScore(records: MealRecord[]) {
  if (records.length === 0) return 0;
  const totals = getTotals(records);
  const averageCalories = totals.calories / records.length;
  const averageProtein = totals.protein / records.length;
  const averageFat = totals.fat / records.length;
  let score = 86;
  if (averageCalories > 760) score -= 6;
  if (averageCalories < 360) score -= 5;
  if (averageProtein < 24) score -= 7;
  if (averageFat > 28) score -= 7;
  if (totals.vegetableRatio < 25) score -= 8;
  if (records.length >= 3 && totals.calories > 2200) score -= 7;
  return clamp(score, 55, 96);
}

function getTotals(records: MealRecord[]) {
  const base = records.reduce(
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
    ...base,
    vegetableRatio: records.length ? Math.round(base.vegetableRatio / records.length) : 0
  };
}

function buildAdvice(records: MealRecord[]) {
  if (records.length === 0) {
    return "上传一餐照片后，系统会帮你整理成今日记录，并给出轻量建议。";
  }

  const totals = getTotals(records);
  if (totals.protein < 55) {
    return "今天蛋白质还可以再补一点，下一餐可以选择鸡蛋、豆腐、鱼肉或鸡胸肉。";
  }
  if (totals.carbs > 230) {
    return "今日碳水摄入略高，晚餐建议减少主食份量，增加蔬菜和优质蛋白。";
  }
  if (totals.fat > 70) {
    return "今天油脂偏高，下一餐可以优先选择清淡汤类、蒸煮类或少油炒菜。";
  }
  if (totals.vegetableRatio < 25) {
    return "今日蔬菜占比偏低，下一餐加一份绿叶菜，会让整体结构更稳。";
  }
  return "今天饮食结构比较均衡，继续保持主食、蛋白质和蔬菜的搭配节奏。";
}

function buildNutritionGap(records: MealRecord[], profile: UserProfile, calorieTarget: number | null): NutritionGap {
  if (!records.length) {
    return {
      title: "先选一份完整搭配",
      body: "今天还没有足够记录，下一餐可以先照顾主食、蛋白质和蔬菜。",
      categories: ["中式简餐", "汤面或米线", "家常菜"]
    };
  }

  const totals = getTotals(records);
  const weight = Number(profile.weight) || 55;
  const proteinTarget = weight * (profile.goal === "增肌补蛋白" ? 1.5 : 1.1);
  const fatReference = ((calorieTarget || 1900) * 0.22) / 9;
  const gaps: string[] = [];
  const categories: string[] = [];

  if (totals.protein < proteinTarget * 0.75) {
    gaps.push("蛋白质仍偏少");
    categories.push("鱼禽瘦肉", "蛋奶豆制品");
  }
  if (totals.vegetableRatio < 25) {
    gaps.push("蔬菜还不够稳定");
    categories.push("绿叶菜与菌菇");
  }
  if (records.length >= 2 && totals.fat < fatReference * 0.6) {
    gaps.push("优质脂肪偏少");
    categories.push("坚果或鱼类");
  }
  if (records.length >= 2 && totals.carbs < 110) {
    gaps.push("主食摄入偏少");
    categories.push("杂粮主食");
  }

  const restrictions = `${profile.allergies}、${profile.avoidedFoods}`;
  const safeCategories = [...new Set(categories)].filter((item) => !restrictions.split(/[、,，\s]+/).some((blocked) => blocked && item.includes(blocked)));
  if (!gaps.length) {
    return {
      title: "今天的结构已经比较完整",
      body: "下一餐可以继续换一种食材和烹饪方式，不必刻意追着某个数字吃。",
      categories: ["清淡家常菜", "汤锅或炖菜", "时令蔬菜"]
    };
  }

  return {
    title: gaps.slice(0, 2).join("，"),
    body: "推荐优先从下面这些食物类别里选择，再结合自己的饥饿程度安排份量。",
    categories: safeCategories.slice(0, 4).length ? safeCategories.slice(0, 4) : ["配料清楚的日常简餐"]
  };
}

function isSameDay(value: string, date: Date) {
  const target = new Date(value);
  return getDateKey(target) === getDateKey(date);
}

function getRecentRecords(records: MealRecord[], days: number) {
  const since = new Date();
  since.setHours(0, 0, 0, 0);
  since.setDate(since.getDate() - days + 1);
  return records.filter((record) => new Date(record.createdAt) >= since);
}

function getCurrentMonthRecords(records: MealRecord[], referenceDate = new Date()) {
  return records.filter((record) => {
    const date = new Date(record.createdAt);
    return date.getFullYear() === referenceDate.getFullYear() && date.getMonth() === referenceDate.getMonth();
  });
}

function getRecordedDayCount(records: MealRecord[]) {
  return new Set(records.map((record) => getDateKey(new Date(record.createdAt)))).size;
}

function getRecordsByDate(records: MealRecord[]) {
  return records.reduce<Record<string, MealRecord[]>>((acc, record) => {
    const key = getDateKey(new Date(record.createdAt));
    acc[key] = [...(acc[key] || []), record];
    return acc;
  }, {});
}

function buildProfileContext(profile: UserProfile) {
  const parts = [
    profile.age ? `年龄 ${profile.age} 岁` : "",
    profile.gender && profile.gender !== "未设置" ? `性别 ${profile.gender}` : "",
    profile.height ? `身高 ${profile.height}cm` : "",
    profile.weight ? `体重 ${profile.weight}kg` : "",
    profile.activityLevel ? `日常活动量：${profile.activityLevel}` : "",
    profile.goal ? `当前饮食目标：${profile.goal}` : "",
    profile.needs.length ? `近期需求：${profile.needs.join("、")}` : "",
    profile.customNeed.trim() ? `用户补充要求：${profile.customNeed.trim()}` : "",
    profile.allergies.trim() ? `必须避开的过敏原：${profile.allergies.trim()}` : "",
    profile.avoidedFoods.trim() ? `用户不吃或不喜欢：${profile.avoidedFoods.trim()}` : ""
  ].filter(Boolean);

  return parts.length ? parts.join("；") : "用户暂未填写个人饮食背景。";
}

function hasProfileInfo(profile: UserProfile) {
  return Boolean(
    profile.name.trim() ||
    profile.height.trim() ||
    profile.weight.trim() ||
    profile.age.trim() ||
    (profile.gender && profile.gender !== "未设置") ||
    profile.needs.length ||
    profile.customNeed.trim() ||
    profile.allergies.trim() ||
    profile.avoidedFoods.trim()
  );
}

function calculateDailyCalorieRange(profile: UserProfile) {
  const height = Number(profile.height);
  const weight = Number(profile.weight);
  const age = Number(profile.age);
  if (!height || !weight || !age || profile.gender === "未设置") return null;

  const genderAdjustment = profile.gender === "男" ? 5 : profile.gender === "女" ? -161 : -78;
  const basalMetabolism = 10 * weight + 6.25 * height - 5 * age + genderAdjustment;
  const activityFactors: Record<string, number> = {
    "久坐少动": 1.2,
    "日常活动": 1.375,
    "经常运动": 1.55,
    "高强度运动": 1.725
  };
  const goalAdjustment = profile.goal === "减脂入门" ? -300 : profile.goal === "增肌补蛋白" ? 200 : 0;
  const midpoint = Math.round(clamp(basalMetabolism * (activityFactors[profile.activityLevel] || 1.375) + goalAdjustment, 1200, 4000) / 10) * 10;
  const spread = Math.max(120, Math.round((midpoint * 0.08) / 10) * 10);
  return {
    low: Math.max(1100, midpoint - spread),
    high: Math.min(4200, midpoint + spread),
    midpoint
  };
}

function hashText(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function selectFreshFallbackMenus(
  scene: MealScene,
  targetMeal: MealTarget,
  intent: MealIntent,
  history: string[],
  variant: number
) {
  const pool = targetMeal === "早餐"
    ? scene === "自己做" ? fallbackMenuPools.breakfastHome : fallbackMenuPools.breakfastOutside
    : scene === "点外卖" ? fallbackMenuPools.takeaway : scene === "到店吃" ? fallbackMenuPools.dineIn : fallbackMenuPools.home;
  const preferredPattern = intent === "就是要放纵！！！"
    ? /火锅|烧烤|酸菜鱼|麻辣烫|面食|焖饭/
    : intent === "健身补充"
      ? /鸡|牛肉|鱼|虾|豆腐|蒸蛋/
      : intent === "减脂控制"
        ? /蒸|清汤|杂粮|轻食|蔬菜|时蔬/
        : null;
  const intentOrdered = preferredPattern
    ? [...pool.filter((menu) => preferredPattern.test(`${menu.category}${menu.name}`)), ...pool.filter((menu) => !preferredPattern.test(`${menu.category}${menu.name}`))]
    : pool;
  const seed = parseInt(hashText(`${getDateKey(new Date())}-${scene}-${targetMeal}-${intent}`), 36) || 0;
  const offset = (seed + variant * 3) % intentOrdered.length;
  const rotated = [...intentOrdered.slice(offset), ...intentOrdered.slice(0, offset)];
  const recentlySeen = (menu: NextMealMenu) => history.some((item) =>
    (menu.category && item.includes(menu.category)) || item.includes(menu.name)
  );
  const ordered = [
    ...rotated.filter((menu) => !recentlySeen(menu)),
    ...rotated.filter((menu) => recentlySeen(menu))
  ];
  const selected: NextMealMenu[] = [];
  const usedTypes = new Set<string>();
  for (const menu of ordered) {
    const typeKey = menu.category || menu.name;
    if (usedTypes.has(typeKey)) continue;
    selected.push(menu);
    usedTypes.add(typeKey);
    if (selected.length === 3) return selected;
  }
  return [...selected, ...ordered.filter((menu) => !selected.includes(menu))].slice(0, 3);
}

function buildTrendDays(recordsByDate: Record<string, MealRecord[]>, days: number) {
  const today = new Date();
  return Array.from({ length: days }, (_, index) => {
    const date = new Date(today);
    date.setDate(today.getDate() - days + index + 1);
    const key = getDateKey(date);
    const dayRecords = recordsByDate[key] || [];
    return {
      key,
      day: date.getDate(),
      weekday: ["日", "一", "二", "三", "四", "五", "六"][date.getDay()],
      isToday: key === getDateKey(today),
      records: dayRecords,
      totals: getTotals(dayRecords)
    };
  });
}

function buildCurrentMonthTrendDays(recordsByDate: Record<string, MealRecord[]>) {
  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  return Array.from({ length: daysInMonth }, (_, index) => {
    const date = new Date(year, month, index + 1);
    const key = getDateKey(date);
    const dayRecords = recordsByDate[key] || [];
    return {
      key,
      day: index + 1,
      weekday: ["日", "一", "二", "三", "四", "五", "六"][date.getDay()],
      isToday: key === getDateKey(today),
      records: dayRecords,
      totals: getTotals(dayRecords)
    };
  });
}

function buildObservationInsight(records: MealRecord[], dailyTarget: number | null, dayCount: number) {
  if (dayCount < 3) {
    return {
      title: "再记录几天，会更看得出规律",
      body: "至少记录 3 天后，这里会结合每天热量、油脂、蔬菜和常吃食物，给出一段周期观察。"
    };
  }

  const totals = getTotals(records);
  const averageCalories = Math.round(totals.calories / dayCount);
  const averageFat = Math.round(totals.fat / dayCount);
  const topFood = getTopFoods(records)[0];

  if (dailyTarget && averageCalories > dailyTarget * 1.12) {
    return {
      title: "最近整体吃得比参考量多一些",
      body: `日均约 ${averageCalories} kcal，比个人参考值高。可以先从减少油炸、含糖饮料或夜宵频率开始，不需要突然大幅少吃。`
    };
  }
  if (averageFat > 70) {
    return {
      title: "近期油脂摄入有些集中",
      body: "下一阶段可以多选蒸、煮、炖和清炒，把重油菜分散开，通常比精确计算每一克更容易坚持。"
    };
  }
  if (totals.vegetableRatio < 25) {
    return {
      title: "蔬菜出现得还不够稳定",
      body: "试着让每天至少两餐看得到蔬菜，绿叶菜、菌菇和番茄都可以轮换，不必只吃沙拉。"
    };
  }
  return {
    title: "近期饮食节奏比较稳定",
    body: `${topFood ? `“${topFood}”出现得比较多。` : ""}整体热量和营养结构没有明显偏科，继续保持多样搭配即可。`
  };
}

function getFoodFrequency(records: MealRecord[], limit = 8) {
  const counts = records.reduce<Record<string, number>>((acc, record) => {
    record.foods.forEach((food) => {
      acc[food] = (acc[food] || 0) + 1;
    });
    return acc;
  }, {});

  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([food, count]) => ({ food, count }));
}

function getTopFoods(records: MealRecord[]) {
  return getFoodFrequency(records, 4).map((item) => item.food);
}

function getNextMealTarget(records: MealRecord[], hour: number): MealTarget {
  const recordedSlots = new Set(records.map((record) => record.slot));
  if (hour < 11 && !recordedSlots.has("早餐")) return "早餐";
  if (hour < 16 && !recordedSlots.has("午餐")) return "午餐";
  if (hour < 21 && !recordedSlots.has("晚餐")) return "晚餐";
  return "下一顿正餐";
}

function buildNextMealIdea(records: MealRecord[], profile: UserProfile, scene: MealScene, targetMeal: MealTarget, intent: MealIntent) {
  const totals = getTotals(records);
  const focusText = [...profile.needs, profile.customNeed].join("、");
  const proteinLow = !records.length || profile.goal === "增肌补蛋白" || focusText.includes("健身") || focusText.includes("蛋白") || totals.protein < 55;
  const vegetableLow = !records.length || totals.vegetableRatio < 25;
  const fatHigh = totals.fat > 70;
  const carbsHigh = totals.carbs > 230;
  const nutritionFocus = intent === "健身补充"
    ? "这餐优先安排足量优质蛋白和适量主食"
    : intent === "减脂控制"
      ? "这餐优先蛋白质和蔬菜，主食保持适量"
      : intent === "就是要放纵！！！"
        ? "这餐可以选更喜欢的口味，吃到舒服即可"
        : proteinLow
          ? "今天优先补足优质蛋白"
          : vegetableLow
            ? "今天优先补一份蔬菜"
            : fatHigh
              ? "今天优先少油清淡"
              : carbsHigh
                ? "今天主食份量可以收一点"
                : "今天继续保持均衡搭配";

  if (targetMeal === "早餐") {
    if (scene === "自己做") {
      return {
        title: "早餐在家这样搭",
        tip: "早餐先照顾蛋白质和主食，再加一份水果或蔬菜，上午会更踏实。",
        menus: [
          { category: "", name: "鸡蛋燕麦牛奶", detail: "一个鸡蛋，一碗燕麦牛奶，配一份水果" },
          { category: "", name: "全麦三明治", detail: "鸡蛋和生菜夹全麦面包，搭无糖豆浆" },
          { category: "", name: "杂粮粥配蒸蛋", detail: "一小碗杂粮粥，一份蒸蛋，加凉拌蔬菜" }
        ]
      };
    }
    if (scene === "到店吃") {
      return {
        title: "到店早餐三选一",
        tip: "优先选有蛋、奶或豆制品的早餐，油条和甜饮不必同时点。",
        menus: [
          { category: "中式早餐", name: "鸡蛋豆浆套餐", detail: "无糖豆浆配鸡蛋，主食选小份" },
          { category: "西式早餐", name: "鸡蛋早餐堡", detail: "搭无糖咖啡或牛奶，不加薯饼" },
          { category: "面包轻食", name: "早餐帕尼尼", detail: "搭牛奶或无糖饮料，再补一份水果" }
        ]
      };
    }
    return {
      title: "外卖早餐这样点",
      tip: "选择搭配清楚的早餐，尽量包含蛋白质和一份主食。",
      menus: [
        { category: "中式早餐", name: "鸡蛋豆浆套餐", detail: "豆浆选无糖，主食保持小份" },
        { category: "西式早餐", name: "鸡蛋早餐堡", detail: "搭牛奶或无糖咖啡，不加薯饼" },
        { category: "面包轻食", name: "早餐帕尼尼", detail: "搭牛奶，另补一份方便携带的水果" }
      ]
    };
  }

  if (scene === "到店吃") {
    return {
      title: "到店这样选更稳",
      tip: `${nutritionFocus}，优先选择有蛋白、有蔬菜的餐饮类型。`,
      menus: [
        { category: "汤面馆", name: "牛肉汤面", detail: "青菜加量，面吃七成，汤少喝" },
        { category: "中式快餐", name: "鸡肉套餐", detail: "米饭小份，再配一份当季时蔬" },
        { category: "中式简餐", name: "鸡肉饭", detail: "饭量减半，搭青菜和无糖豆浆" }
      ]
    };
  }
  if (scene === "自己做") {
    return {
      title: "家常菜三选一",
      tip: `${nutritionFocus}，都用常见食材，做法保持少油即可。`,
      menus: [
        { category: "", name: "番茄炒蛋配青菜", detail: "两个鸡蛋，一盘青菜，米饭半碗" },
        { category: "", name: "冬瓜虾仁炖豆腐", detail: "虾仁一掌心，豆腐半盒，少油炖煮" },
        { category: "", name: "青椒牛肉配菌菇汤", detail: "牛肉一掌心，青椒加量，主食小份" }
      ]
    };
  }
  return {
    title: "外卖这样点更均衡",
    tip: `${nutritionFocus}，优先选配菜清楚、方便调整份量的餐饮类型。`,
    menus: [
      { category: "中式快餐", name: "蒸鸡套餐", detail: "小份米饭，加一份时蔬，酱汁少放" },
      { category: "牛肉饭", name: "牛肉蔬菜饭", detail: "饭选小份，蔬菜加量，不配甜饮" },
      { category: "西式快餐", name: "板烧鸡腿堡", detail: "搭玉米杯和无糖饮料，不加薯条" }
    ]
  };
}

function applyProfileRestrictions(idea: NextMealIdea, profile: UserProfile): NextMealIdea {
  const restrictions = `${profile.allergies}、${profile.avoidedFoods}`
    .split(/[、,，/；;\s]+/)
    .map((item) => item.replace(/过敏|忌口|不吃|不喜欢/g, "").trim())
    .filter((item) => item.length >= 1);
  if (!restrictions.length) return idea;

  const hasAllergyInfo = Boolean(profile.allergies.trim());
  const allowedMenus = hasAllergyInfo ? [] : idea.menus.filter((menu) => {
    const content = `${menu.category}${menu.name}${menu.detail}`;
    return !restrictions.some((item) => content.includes(item));
  });
  const restrictionLabel = restrictions.slice(0, 3).join("、");
  const cautiousMenus: NextMealMenu[] = [
    { category: "", name: "自选清淡套餐", detail: `下单前请商家确认不含${restrictionLabel}` },
    { category: "", name: "现点现做组合", detail: "主动说明过敏与忌口，并确认酱料和配菜" },
    { category: "", name: "熟悉食材搭配", detail: "优先选择配料清楚、自己平时吃过的食物" }
  ];

  return {
    ...idea,
    title: hasAllergyInfo ? "先按过敏信息筛选" : idea.title,
    tip: `${hasAllergyInfo ? "智能建议暂时不可用，备用菜单无法确认所有配料。" : idea.tip} 已参考档案中的过敏与忌口；配料不清楚时请向商家再次确认。`,
    menus: [...allowedMenus, ...cautiousMenus].slice(0, 3)
  };
}

function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });
}

async function compressMealImage(file: File) {
  const originalDataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

  const image = await loadImage(originalDataUrl);
  const maxSide = 1280;
  const ratio = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
  const width = Math.round(image.naturalWidth * ratio);
  const height = Math.round(image.naturalHeight * ratio);

  if (ratio === 1 && file.size < 900_000) {
    return originalDataUrl;
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) return originalDataUrl;
  context.drawImage(image, 0, 0, width, height);

  return canvas.toDataURL("image/jpeg", 0.86);
}

export default function Home() {
  const [activeTab, setActiveTab] = useState<AppTab>("record");
  const [preview, setPreview] = useState<string | null>(null);
  const [isRecognizing, setIsRecognizing] = useState(false);
  const [recognitionStage, setRecognitionStage] = useState<RecognitionStage>("idle");
  const [recognition, setRecognition] = useState<Recognition | null>(null);
  const [recognitionMode, setRecognitionMode] = useState<"kimi" | null>(null);
  const [recognitionError, setRecognitionError] = useState("");
  const [recognitionDebug, setRecognitionDebug] = useState("");
  const [textMeal, setTextMeal] = useState("");
  const [isTextEstimating, setIsTextEstimating] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [records, setRecords] = useState<MealRecord[]>([]);
  const [profile, setProfile] = useState<UserProfile>(emptyProfile);
  const [showProfilePanel, setShowProfilePanel] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [observationRange, setObservationRange] = useState<ObservationRange>("week");
  const [selectedDateKey, setSelectedDateKey] = useState(() => getDateKey(new Date()));
  const [selectedSlot, setSelectedSlot] = useState<MealSlot>("午餐");
  const [selectedScene, setSelectedScene] = useState<MealScene>("点外卖");
  const [selectedIntent, setSelectedIntent] = useState<MealIntent>("均衡一点");
  const [selectedPortion, setSelectedPortion] = useState<PortionSize | null>(null);
  const [isReestimatingPortion, setIsReestimatingPortion] = useState(false);
  const [localHour, setLocalHour] = useState<number | null>(null);
  const [todayDisplay, setTodayDisplay] = useState("今天");
  const [generatedNextMealIdea, setGeneratedNextMealIdea] = useState<NextMealIdea | null>(null);
  const [nextMealCache, setNextMealCache] = useState<Record<string, NextMealIdea>>({});
  const [hasLoadedNextMealCache, setHasLoadedNextMealCache] = useState(false);
  const [recommendationHistory, setRecommendationHistory] = useState<string[]>([]);
  const [hasLoadedRecommendationHistory, setHasLoadedRecommendationHistory] = useState(false);
  const [fallbackVariant, setFallbackVariant] = useState(0);
  const [isUsingCachedNextMeal, setIsUsingCachedNextMeal] = useState(false);
  const [showNextMealFallback, setShowNextMealFallback] = useState(false);
  const [generatedObservationInsight, setGeneratedObservationInsight] = useState<PeriodInsight | null>(null);
  const [isGeneratingNextMeal, setIsGeneratingNextMeal] = useState(false);
  const [isGeneratingObservation, setIsGeneratingObservation] = useState(false);
  const [toast, setToast] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadSectionRef = useRef<HTMLElement>(null);
  const nextMealRequestRef = useRef(0);
  const observationRequestRef = useRef(0);

  useEffect(() => {
    const saved = window.localStorage.getItem("chileme-records");
    if (saved) {
      setRecords(JSON.parse(saved) as MealRecord[]);
    }
    let restoredProfile = emptyProfile;
    const savedProfile = window.localStorage.getItem("chileme-profile");
    if (savedProfile) {
      restoredProfile = { ...emptyProfile, ...(JSON.parse(savedProfile) as UserProfile) };
      setProfile(restoredProfile);
    }
    const savedNextMealCache = window.localStorage.getItem(NEXT_MEAL_CACHE_KEY);
    if (savedNextMealCache) {
      try {
        setNextMealCache(JSON.parse(savedNextMealCache) as Record<string, NextMealIdea>);
      } catch {
        window.localStorage.removeItem(NEXT_MEAL_CACHE_KEY);
      }
    }
    setHasLoadedNextMealCache(true);
    const savedRecommendationHistory = window.localStorage.getItem(RECOMMENDATION_HISTORY_KEY);
    if (savedRecommendationHistory) {
      try {
        setRecommendationHistory(JSON.parse(savedRecommendationHistory) as string[]);
      } catch {
        window.localStorage.removeItem(RECOMMENDATION_HISTORY_KEY);
      }
    }
    setHasLoadedRecommendationHistory(true);
    const seenOnboarding = window.localStorage.getItem("chileme-onboarding-seen");
    if (hasProfileInfo(restoredProfile)) {
      window.localStorage.setItem("chileme-onboarding-seen", "true");
    } else if (!seenOnboarding) {
      setShowOnboarding(true);
    }
    setTodayDisplay(new Intl.DateTimeFormat("zh-CN", { month: "long", day: "numeric", weekday: "short" }).format(new Date()));
    setLocalHour(new Date().getHours());
  }, []);

  useEffect(() => {
    window.localStorage.setItem("chileme-records", JSON.stringify(records));
  }, [records]);

  useEffect(() => {
    window.localStorage.setItem("chileme-profile", JSON.stringify(profile));
  }, [profile]);

  useEffect(() => {
    if (!hasLoadedNextMealCache) return;
    window.localStorage.setItem(NEXT_MEAL_CACHE_KEY, JSON.stringify(nextMealCache));
  }, [nextMealCache, hasLoadedNextMealCache]);

  useEffect(() => {
    if (!hasLoadedRecommendationHistory) return;
    window.localStorage.setItem(RECOMMENDATION_HISTORY_KEY, JSON.stringify(recommendationHistory));
  }, [recommendationHistory, hasLoadedRecommendationHistory]);

  useEffect(() => {
    nextMealRequestRef.current += 1;
    observationRequestRef.current += 1;
    setGeneratedNextMealIdea(null);
    setShowNextMealFallback(false);
    setIsUsingCachedNextMeal(false);
    setGeneratedObservationInsight(null);
    setIsGeneratingNextMeal(false);
    setIsGeneratingObservation(false);
  }, [records, profile]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 2400);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const todayRecords = useMemo(() => records.filter((record) => isSameDay(record.createdAt, new Date())), [records]);
  const observedRecords = useMemo(
    () => observationRange === "week" ? getRecentRecords(records, 7) : getCurrentMonthRecords(records),
    [records, observationRange]
  );
  const preferenceRecords = useMemo(() => getRecentRecords(records, 30), [records]);
  const totals = useMemo(() => getTotals(todayRecords), [todayRecords]);
  const score = useMemo(() => calcScore(todayRecords), [todayRecords]);
  const advice = useMemo(() => buildAdvice(todayRecords), [todayRecords]);
  const observedTotals = useMemo(() => getTotals(observedRecords), [observedRecords]);
  const observedDayCount = useMemo(() => getRecordedDayCount(observedRecords), [observedRecords]);
  const observedFoodFrequency = useMemo(() => getFoodFrequency(observedRecords, 6), [observedRecords]);
  const preferenceSignals = useMemo(() => getFoodFrequency(preferenceRecords, 8), [preferenceRecords]);
  const targetMeal = useMemo(() => getNextMealTarget(todayRecords, localHour ?? 12), [todayRecords, localHour]);
  const localNextMealIdea = useMemo(
    () => {
      const idea = buildNextMealIdea(todayRecords, profile, selectedScene, targetMeal, selectedIntent);
      return applyProfileRestrictions({
        ...idea,
        menus: selectFreshFallbackMenus(selectedScene, targetMeal, selectedIntent, recommendationHistory, fallbackVariant)
      }, profile);
    },
    [todayRecords, profile, selectedScene, selectedIntent, targetMeal, recommendationHistory, fallbackVariant]
  );
  const dailyCalorieRange = useMemo(() => calculateDailyCalorieRange(profile), [profile]);
  const dailyCalorieTarget = dailyCalorieRange?.midpoint || null;
  const nutritionGap = useMemo(
    () => buildNutritionGap(todayRecords, profile, dailyCalorieTarget),
    [todayRecords, profile, dailyCalorieTarget]
  );
  const profileContext = useMemo(() => buildProfileContext(profile), [profile]);
  const recordsByDate = useMemo(() => getRecordsByDate(records), [records]);
  const trendDays = useMemo(
    () => observationRange === "week" ? buildTrendDays(recordsByDate, 7) : buildCurrentMonthTrendDays(recordsByDate),
    [recordsByDate, observationRange]
  );
  const selectedDateRecords = recordsByDate[selectedDateKey] || [];
  const selectedDateTotals = useMemo(() => getTotals(selectedDateRecords), [selectedDateRecords]);
  const selectedDateScore = useMemo(() => calcScore(selectedDateRecords), [selectedDateRecords]);
  const selectedDateLabel = selectedDateKey === getDateKey(new Date()) ? "今天" : selectedDateKey;
  const macrosTotal = Math.max(totals.protein + totals.carbs + totals.fat, 1);
  const averageDailyCalories = observedDayCount ? Math.round(observedTotals.calories / observedDayCount) : 0;
  const remainingCalories = dailyCalorieTarget ? dailyCalorieTarget - totals.calories : null;
  const calorieProgress = dailyCalorieRange ? clamp((totals.calories / dailyCalorieRange.high) * 100, 0, 100) : 0;
  const trendScaleMax = Math.max(1000, dailyCalorieTarget || 0, ...trendDays.map((day) => day.totals.calories)) * 1.08;
  const localObservationInsight = useMemo(
    () => buildObservationInsight(observedRecords, dailyCalorieTarget, observedDayCount),
    [observedRecords, dailyCalorieTarget, observedDayCount]
  );
  const nextMealIdea = generatedNextMealIdea || (showNextMealFallback ? localNextMealIdea : null);
  const observationInsight = generatedObservationInsight || localObservationInsight;
  const recognitionSteps: Array<{ key: RecognitionStage; title: string; desc: string }> = [
    { key: "uploading", title: "上传中", desc: "正在压缩并上传餐食图片" },
    { key: "recognizing", title: "识别中", desc: "正在识别菜品和常见份量" },
    { key: "returning", title: "数据返回中", desc: "正在整理热量、营养和评价" }
  ];
  const activeRecognitionStepIndex = Math.max(0, recognitionSteps.findIndex((step) => step.key === recognitionStage));
  const activeRecognitionStep = recognitionSteps.find((step) => step.key === recognitionStage) || recognitionSteps[0];
  const appTabs: Array<{ key: AppTab; label: string; icon: LucideIcon }> = [
    { key: "record", label: "我的记录", icon: NotebookPen },
    { key: "today", label: "今日", icon: Soup },
    { key: "observe", label: "观察", icon: CalendarDays },
    { key: "next", label: "下一餐", icon: Salad },
    { key: "profile", label: "我的", icon: UserRound }
  ];

  function scrollToUpload() {
    setActiveTab("record");
    uploadSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function markOnboardingSeen() {
    window.localStorage.setItem("chileme-onboarding-seen", "true");
    setShowOnboarding(false);
  }

  function skipOnboarding() {
    markOnboardingSeen();
    setShowProfilePanel(false);
  }

  function openProfileFromGuide() {
    markOnboardingSeen();
    setActiveTab("profile");
    setShowProfilePanel(true);
  }

  function saveProfile() {
    window.localStorage.setItem("chileme-profile", JSON.stringify(profile));
    markOnboardingSeen();
    setShowProfilePanel(false);
    setToast("个人档案已保存");
  }

  async function requestCoach<T>(task: "next-meal" | "period-insight", data: Record<string, unknown>) {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 18_000);
    try {
      const response = await fetch("/api/coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ task, profileContext, data }),
        signal: controller.signal
      });
      const payload = (await response.json()) as { result?: T; error?: string };
      if (!response.ok || !payload.result) throw new Error(payload.error || "建议生成失败");
      return payload.result;
    } finally {
      window.clearTimeout(timeout);
    }
  }

  function getNextMealCacheKey(scene: MealScene, intent: MealIntent) {
    return hashText(JSON.stringify({
      version: 3,
      date: getDateKey(new Date()),
      scene,
      intent,
      targetMeal,
      profile: profileContext,
      foodFrequency: preferenceSignals,
      records: todayRecords.map((record) => ({
        id: record.id,
        foods: record.foods,
        calories: record.calories,
        protein: record.protein,
        carbs: record.carbs,
        fat: record.fat,
        vegetableRatio: record.vegetableRatio
      }))
    }));
  }

  async function generateNextMeal(scene: MealScene, forceRefresh = false, intent: MealIntent = selectedIntent) {
    const cacheKey = getNextMealCacheKey(scene, intent);
    const cachedIdea = nextMealCache[cacheKey];
    if (!forceRefresh && cachedIdea) {
      nextMealRequestRef.current += 1;
      setGeneratedNextMealIdea(cachedIdea);
      setShowNextMealFallback(false);
      setIsUsingCachedNextMeal(true);
      setIsGeneratingNextMeal(false);
      return;
    }

    const requestId = ++nextMealRequestRef.current;
    const previousMenus = generatedNextMealIdea?.menus || cachedIdea?.menus || [];
    if (forceRefresh) setFallbackVariant((current) => current + 1);
    setGeneratedNextMealIdea(null);
    setShowNextMealFallback(false);
    setIsUsingCachedNextMeal(false);
    setIsGeneratingNextMeal(true);
    try {
      const result = await requestCoach<NextMealIdea>("next-meal", {
        mealScene: scene,
        mealIntent: intent,
        targetMeal,
        todayMealCount: todayRecords.length,
        todayFoods: getTopFoods(todayRecords),
        todayTotals: totals,
        dailyCalorieTarget,
        dailyCalorieRange,
        remainingCalories,
        nutritionGap,
        recentFoodFrequency: preferenceSignals,
        recentRecommendations: recommendationHistory,
        avoidMenus: forceRefresh ? previousMenus.map((menu) => `${menu.category}${menu.name}`) : []
      });
      if (nextMealRequestRef.current === requestId) {
        setGeneratedNextMealIdea(result);
        setNextMealCache((current) => Object.fromEntries(
          Object.entries({ ...current, [cacheKey]: result }).slice(-20)
        ));
        setRecommendationHistory((current) => {
          const nextItems = result.menus.map((menu) => [menu.category, menu.name].filter(Boolean).join("·"));
          return [...nextItems, ...current.filter((item) => !nextItems.includes(item))].slice(0, 24);
        });
        setShowNextMealFallback(false);
        setIsUsingCachedNextMeal(false);
      }
    } catch {
      if (nextMealRequestRef.current === requestId) {
        setGeneratedNextMealIdea(null);
        setShowNextMealFallback(true);
        setIsUsingCachedNextMeal(false);
      }
    } finally {
      if (nextMealRequestRef.current === requestId) setIsGeneratingNextMeal(false);
    }
  }

  async function generateObservation(range: ObservationRange) {
    const requestId = ++observationRequestRef.current;
    const rangeRecords = range === "week" ? getRecentRecords(records, 7) : getCurrentMonthRecords(records);
    const rangeDays = range === "week" ? 7 : new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate();
    const rangeTotals = getTotals(rangeRecords);
    const recordedDays = getRecordedDayCount(rangeRecords);
    const rangeTrend = range === "week" ? buildTrendDays(recordsByDate, 7) : buildCurrentMonthTrendDays(recordsByDate);
    const highCalorieDays = dailyCalorieTarget
      ? rangeTrend.filter((day) => day.totals.calories > dailyCalorieTarget * 1.1).length
      : 0;

    setGeneratedObservationInsight(null);
    setIsGeneratingObservation(true);
    try {
      const result = await requestCoach<PeriodInsight>("period-insight", {
        rangeDays,
        recordedDays,
        mealCount: rangeRecords.length,
        averageCalories: recordedDays ? Math.round(rangeTotals.calories / recordedDays) : 0,
        averageProtein: recordedDays ? Math.round(rangeTotals.protein / recordedDays) : 0,
        averageCarbs: recordedDays ? Math.round(rangeTotals.carbs / recordedDays) : 0,
        averageFat: recordedDays ? Math.round(rangeTotals.fat / recordedDays) : 0,
        averageVegetableRatio: rangeTotals.vegetableRatio,
        dailyCalorieTarget,
        highCalorieDays,
        topFoods: getTopFoods(rangeRecords),
        foodFrequency: getFoodFrequency(rangeRecords, 8)
      });
      if (observationRequestRef.current === requestId) setGeneratedObservationInsight(result);
    } catch {
      if (observationRequestRef.current === requestId) setGeneratedObservationInsight(null);
    } finally {
      if (observationRequestRef.current === requestId) setIsGeneratingObservation(false);
    }
  }

  function handleSceneChange(scene: MealScene) {
    setSelectedScene(scene);
    void generateNextMeal(scene, false, selectedIntent);
  }

  function handleIntentChange(intent: MealIntent) {
    setSelectedIntent(intent);
    void generateNextMeal(selectedScene, false, intent);
  }

  function handleObservationRangeChange(range: ObservationRange) {
    setObservationRange(range);
    void generateObservation(range);
  }

  function handleTabChange(tab: AppTab) {
    setActiveTab(tab);
    if (tab === "profile") {
      if (showOnboarding) markOnboardingSeen();
      setShowProfilePanel(!hasProfileInfo(profile));
    }
    if (tab === "next" && !generatedNextMealIdea && !isGeneratingNextMeal) void generateNextMeal(selectedScene);
    if (tab === "observe" && !generatedObservationInsight && !isGeneratingObservation) void generateObservation(observationRange);
  }

  function fillSampleText() {
    setTextMeal("午餐吃了蛋炒饭一盘，里面有鸡蛋、火腿丁和葱花，还喝了一杯无糖豆浆。");
    setPreview(null);
    setRecognition(null);
    setRecognitionError("");
    scrollToUpload();
    setToast("已填入一条例子，可以直接点文字估算");
  }

  function toggleNeed(need: string) {
    setProfile((current) => ({
      ...current,
      needs: current.needs.includes(need)
        ? current.needs.filter((item) => item !== need)
        : [...current.needs, need]
    }));
  }

  async function estimateByText(description: string, portion?: PortionSize, baseEstimate?: Recognition) {
    const response = await fetch("/api/estimate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ description, portion, baseEstimate, profileContext })
    });
    const data = (await response.json()) as { result?: Recognition; error?: string };
    if (!response.ok || !data.result) {
      throw new Error(data.error || "估算失败");
    }
    return data.result;
  }

  function handleUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    void (async () => {
      setRecognition(null);
      setSelectedPortion(null);
      setRecognitionMode(null);
      setRecognitionError("");
      setRecognitionDebug("");
      setIsRecognizing(true);
      setRecognitionStage("uploading");

      try {
        const imageDataUrl = await compressMealImage(file);
        setPreview(imageDataUrl);
        await wait(220);
        setRecognitionStage("recognizing");

        const response = await fetch("/api/recognize", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ imageDataUrl, profileContext })
        });
        setRecognitionStage("returning");
        const data = (await response.json()) as {
          mode?: "kimi";
          result?: Recognition;
          error?: string;
          keySource?: "browser" | "env";
          keyTail?: string;
        };
        if (!response.ok || !data.result) {
          setRecognitionDebug("");
          throw new Error(data.error || "这次没有整理成功，请稍后再试。");
        }
        setRecognition(data.result);
        setSelectedPortion(null);
        setRecognitionMode(data.mode || "kimi");
      } catch (error) {
        const message = error instanceof Error ? error.message : "这次没有整理成功，请稍后再试。";
        setRecognitionError(message);
        setToast(message);
      } finally {
        setIsRecognizing(false);
        setRecognitionStage("idle");
      }
    })();
  }

  async function handleTextEstimate() {
    const description = textMeal.trim();
    if (!description) {
      setToast("请先描述今天吃了什么");
      return;
    }
    setIsTextEstimating(true);
    setRecognitionError("");
    try {
      const result = await estimateByText(description);
      setRecognition(result);
      setSelectedPortion(null);
      setRecognitionMode("kimi");
      setPreview(null);
      setRecognitionDebug("");
      setToast("文字描述已估算完成");
    } catch (error) {
      const message = error instanceof Error ? error.message : "估算失败";
      setRecognitionError(message);
      setToast(message);
    } finally {
      setIsTextEstimating(false);
    }
  }

  async function confirmPortion(portion: PortionSize) {
    if (!recognition || isReestimatingPortion) return;
    setSelectedPortion(portion);
    setIsReestimatingPortion(true);
    try {
      const result = await estimateByText(recognition.foods.join("、"), portion, recognition);
      setRecognition(result);
      setToast("已按确认的份量重新估算");
    } catch (error) {
      setSelectedPortion(null);
      const message = error instanceof Error ? error.message : "份量估算失败";
      setToast(message);
    } finally {
      setIsReestimatingPortion(false);
    }
  }

  function startVoiceInput() {
    const SpeechRecognition = (window as SpeechWindow).SpeechRecognition || (window as SpeechWindow).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setToast("当前浏览器不支持语音输入，可以直接打字记录");
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.lang = "zh-CN";
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.onresult = (event) => {
      const transcript = event.results[0]?.[0]?.transcript || "";
      setTextMeal((current) => [current, transcript].filter(Boolean).join("，"));
    };
    recognition.onerror = () => {
      setIsListening(false);
      setToast("语音识别失败，可以直接输入文字");
    };
    recognition.onend = () => setIsListening(false);
    setIsListening(true);
    recognition.start();
  }

  function createRecord() {
    if (!recognition) return;
    const record: MealRecord = {
      ...recognition,
      id: `${Date.now()}`,
      slot: selectedSlot,
      portion: selectedPortion || "regular",
      createdAt: new Date().toISOString()
    };
    setRecords((current) => [record, ...current]);
    setSelectedDateKey(getDateKey(new Date()));
    setToast(`${selectedSlot}记录已生成`);
    setRecognition(null);
    setSelectedPortion(null);
    setPreview(null);
    setTextMeal("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function updateRecord(nextRecord: MealRecord) {
    setRecords((current) => current.map((record) => (record.id === nextRecord.id ? nextRecord : record)));
    setToast("饮食记录已更新");
  }

  function deleteRecord(recordId: string) {
    setRecords((current) => current.filter((record) => record.id !== recordId));
    setToast("这条记录已删除");
  }

  async function reestimateRecord(recordId: string, foods: string[]) {
    const record = records.find((item) => item.id === recordId);
    const estimated = await estimateByText(foods.join("、"), record?.portion, record);
    setRecords((current) => current.map((record) => (record.id === recordId ? { ...record, ...estimated } : record)));
    setToast("营养信息已重新分析");
  }

  function resetDemo() {
    setRecords([]);
    setRecognition(null);
    setSelectedPortion(null);
    setRecognitionMode(null);
    setRecognitionError("");
    setRecognitionDebug("");
    setPreview(null);
    setToast("今日记录已清空");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  const recordsBySlot = mealSlots.reduce<Record<MealSlot, MealRecord[]>>(
    (acc, slot) => {
      acc[slot] = todayRecords.filter((record) => record.slot === slot);
      return acc;
    },
    { 早餐: [], 午餐: [], 晚餐: [], 加餐: [] }
  );

  return (
    <main className={styles.shell}>
      {toast ? <div className={styles.toast}>{toast}</div> : null}

      {activeTab === "record" ? (
      <section className={styles.hero}>
        <div className={styles.heroCopy}>
          <div className={styles.brandRow}>
            <span className={styles.logo}>
              <Utensils size={22} />
            </span>
            <span className={styles.agentName}>日常饮食手账</span>
          </div>
          <h1>吃了么</h1>
          <p>拍下这一餐，把今天吃过的东西好好记下来。</p>
          <div className={styles.heroMeta}>
            <span>{todayDisplay}</span>
            <span>{todayRecords.length ? `今天已记 ${todayRecords.length} 餐` : "今天还没开张"}</span>
          </div>
        </div>
        <button className={styles.iconButton} type="button" onClick={resetDemo} aria-label="清空今日记录" title="清空今日记录">
          <RotateCcw size={18} />
        </button>
      </section>
      ) : null}

      <div className={styles.tabContent}>
      {activeTab === "record" ? (
      <section className={styles.panel} ref={uploadSectionRef}>
        <div className={styles.sectionTitle}>
          <div>
            <span>今天的餐单</span>
            <h2>记下这一餐</h2>
          </div>
          <CookingPot size={22} />
        </div>

        <div className={styles.uploadGrid}>
          <div className={styles.inputColumn}>
            <button className={styles.uploadBox} type="button" onClick={() => fileInputRef.current?.click()}>
              {preview ? (
                <img src={preview} alt="餐食预览" />
              ) : (
                <div className={styles.uploadEmpty}>
                  <ImagePlus size={34} />
                  <strong>拍下这一餐</strong>
                  <span>用一张照片留下今天吃过的东西</span>
                </div>
              )}
            </button>
            <input ref={fileInputRef} className={styles.hiddenInput} type="file" accept="image/*" onChange={handleUpload} />
            <div className={styles.textMealBox}>
              <textarea
                value={textMeal}
                onChange={(event) => setTextMeal(event.target.value)}
                placeholder="也可以直接描述：今天午餐吃了蛋炒饭、一杯无糖豆浆、半份青菜"
                rows={3}
              />
              <div className={styles.textMealActions}>
                <button type="button" className={styles.secondaryButton} onClick={fillSampleText}>
                  <NotebookPen size={16} />
                  填个例子
                </button>
                <button type="button" className={styles.secondaryButton} onClick={startVoiceInput}>
                  <Mic size={16} />
                  {isListening ? "聆听中" : "语音输入"}
                </button>
                <button type="button" onClick={handleTextEstimate} disabled={isTextEstimating}>
                  {isTextEstimating ? <Loader2 className={styles.spin} size={16} /> : <ClipboardList size={16} />}
                  {isTextEstimating ? "整理中" : "整理成记录"}
                </button>
              </div>
            </div>
          </div>

          <div className={styles.recognitionCard}>
            {isRecognizing ? (
              <div className={styles.loadingState}>
                <Loader2 className={styles.spin} size={32} />
                <strong>{activeRecognitionStep.title}</strong>
                <span>{activeRecognitionStep.desc}</span>
                <div className={styles.loadingSteps}>
                  {recognitionSteps.map((step) => (
                    <i
                      key={step.key}
                      className={[
                        styles.loadingStep,
                        activeRecognitionStepIndex >= recognitionSteps.findIndex((item) => item.key === step.key) ? styles.activeLoadingStep : ""
                      ].filter(Boolean).join(" ")}
                    >
                      {step.title}
                    </i>
                  ))}
                </div>
              </div>
            ) : recognition ? (
              <>
                <div className={styles.resultHeader}>
                  <span>
                    <Check size={16} />
                    已整理好
                  </span>
                  <strong>{recognition.calories} kcal</strong>
                </div>
                <p className={styles.modelNote}>
                  {recognitionMode === "kimi"
                    ? "先确认一下菜品，再存进今天的餐单。"
                    : "确认菜品后，就可以存进今天的餐单。"}
                </p>
                <div className={styles.foodTags}>
                  {recognition.foods.map((food) => (
                    <span key={food}>{food}</span>
                  ))}
                </div>
                <div className={styles.nutritionRows}>
                  <NutritionRow label="蛋白质" value={recognition.protein} color="green" />
                  <NutritionRow label="碳水" value={recognition.carbs} color="blue" />
                  <NutritionRow label="脂肪" value={recognition.fat} color="coral" />
                  <NutritionRow label="蔬菜占比" value={recognition.vegetableRatio} unit="%" color="amber" />
                </div>
                <div className={styles.portionConfirm}>
                  <div>
                    <strong>这餐大概吃了多少？</strong>
                    <span>确认后会重新估算热量和营养</span>
                  </div>
                  <div className={styles.portionOptions}>
                    {portionOptions.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        className={selectedPortion === option.value ? styles.activePortion : ""}
                        onClick={() => void confirmPortion(option.value)}
                        disabled={isReestimatingPortion}
                      >
                        <b>{option.label}</b>
                        <small>{option.hint}</small>
                      </button>
                    ))}
                  </div>
                  {isReestimatingPortion ? (
                    <span className={styles.portionStatus}><Loader2 className={styles.spin} size={14} />正在按份量重新估算</span>
                  ) : selectedPortion ? (
                    <span className={styles.portionStatus}><Check size={14} />份量已确认</span>
                  ) : null}
                </div>
                <p className={styles.verdict}>{recognition.verdict}</p>
                <div className={styles.mealContextGrid}>
                  <label>
                    餐别
                    <select value={selectedSlot} onChange={(event) => setSelectedSlot(event.target.value as MealSlot)}>
                      {mealSlots.map((slot) => (
                        <option key={slot}>{slot}</option>
                      ))}
                    </select>
                  </label>
                </div>
                <div className={styles.actions}>
                  <button type="button" onClick={createRecord} disabled={!selectedPortion || isReestimatingPortion}>
                    {isReestimatingPortion ? <Loader2 className={styles.spin} size={18} /> : <Plus size={18} />}
                    {selectedPortion ? "生成饮食记录" : "先确认份量"}
                  </button>
                </div>
              </>
            ) : recognitionError ? (
              <div className={styles.errorState}>
                <X size={28} />
                <strong>{recognitionError}</strong>
                {recognitionDebug ? <small>{recognitionDebug}</small> : null}
                <span>这次没有认出来，可以换一张更清楚的照片，或直接用文字描述。</span>
              </div>
            ) : (
              <div className={styles.idleState}>
                <Soup size={28} />
                <strong>这一餐还没记录</strong>
                <span>上传照片，或者直接说说你吃了什么。</span>
              </div>
            )}
          </div>
        </div>
      </section>
      ) : null}

      {activeTab === "today" ? (
      <>
      <section className={styles.panel}>
        <div className={styles.sectionTitle}>
          <div>
            <span>今天吃过的</span>
            <h2>今日餐单</h2>
          </div>
          <ChevronRight size={22} />
        </div>

        <div className={styles.mealList}>
          {mealSlots.map((slot) => (
            <MealSlotCard
              key={slot}
              slot={slot}
              records={recordsBySlot[slot]}
              onUpdate={updateRecord}
              onDelete={deleteRecord}
              onReestimate={reestimateRecord}
            />
          ))}
        </div>
      </section>
      <section className={styles.panel}>
        <div className={styles.sectionTitle}>
          <div>
            <span>今天的摄入</span>
            <h2>营养概览</h2>
          </div>
          <Activity size={22} />
        </div>

        <div className={styles.calorieBudgetCard}>
          {dailyCalorieRange ? (
            <>
              <div className={styles.budgetHeadline}>
                <div>
                  <span>每日参考区间</span>
                  <strong>{dailyCalorieRange.low}–{dailyCalorieRange.high} kcal</strong>
                </div>
                <div>
                  <span>今天已记录</span>
                  <strong>{totals.calories} kcal</strong>
                </div>
                <div>
                  <span>当前状态</span>
                  <strong>
                    {totals.calories < dailyCalorieRange.low
                      ? "尚未进入区间"
                      : totals.calories > dailyCalorieRange.high
                        ? "高于参考区间"
                        : "参考区间内"}
                  </strong>
                </div>
              </div>
              <div className={styles.budgetTrack} aria-label={`今日热量进度 ${Math.round(calorieProgress)}%`}>
                <i style={{ width: `${calorieProgress}%` }} />
              </div>
              <p>根据年龄、性别、身高、体重、活动量和当前目标估算，仅作日常饮食参考。</p>
            </>
          ) : (
            <div className={styles.budgetEmpty}>
              <div className={styles.budgetEmptyStats}>
                <div>
                  <span>今天已记录</span>
                  <strong>{totals.calories} kcal</strong>
                </div>
                <div>
                  <span>每日参考区间</span>
                  <strong>完善档案后查看</strong>
                  <p>填写年龄、性别、身高和体重后，可以看到适合日常参考的热量范围。</p>
                </div>
              </div>
              <button type="button" onClick={() => { setActiveTab("profile"); setShowProfilePanel(true); }}>
                去完善
                <ChevronRight size={16} />
              </button>
            </div>
          )}
        </div>

        <div className={styles.analysisGrid}>
          <div className={styles.macroBlock}>
            <div className={styles.macroBar} aria-label="三大营养素比例">
              <span style={{ width: `${(totals.protein / macrosTotal) * 100}%`, background: "var(--green)" }} />
              <span style={{ width: `${(totals.carbs / macrosTotal) * 100}%`, background: "var(--blue)" }} />
              <span style={{ width: `${(totals.fat / macrosTotal) * 100}%`, background: "var(--coral)" }} />
            </div>
            <div className={styles.macroLegend}>
              <span>蛋白质 {totals.protein}g</span>
              <span>碳水 {totals.carbs}g</span>
              <span>脂肪 {totals.fat}g</span>
            </div>
          </div>

          <div className={styles.adviceCard}>
            <span>今日轻度建议</span>
            <p>{advice}</p>
            <small>{todayRecords.length ? `结构 ${score} 分 · 蔬菜约 ${totals.vegetableRatio}%` : "记录一餐后开始观察今日结构"}</small>
          </div>
        </div>
        <div className={styles.privacyNote}>
          <ShieldCheck size={17} />
          记录保存在当前浏览器；生成识别和建议时，会发送本次餐食与已填写的饮食档案摘要。
        </div>
      </section>
      </>
      ) : null}

      {activeTab === "observe" || activeTab === "next" ? (
      <section className={styles.insightGrid}>
        {activeTab === "observe" ? (
        <div className={styles.panel}>
          <div className={styles.sectionTitle}>
            <div>
              <span>累计观察</span>
              <h2>每日食物观察</h2>
            </div>
            <div className={styles.rangeSwitch} aria-label="观察周期">
              <button
                type="button"
                className={observationRange === "week" ? styles.activeRange : ""}
                onClick={() => handleObservationRangeChange("week")}
              >
                本周
              </button>
              <button
                type="button"
                className={observationRange === "month" ? styles.activeRange : ""}
                onClick={() => handleObservationRangeChange("month")}
              >
                本月
              </button>
            </div>
          </div>

          <div className={styles.trendPanel}>
            <div className={styles.trendHeader}>
              <div>
                <strong>{observationRange === "week" ? "近 7 天热量趋势" : `${new Date().getMonth() + 1} 月每日热量`}</strong>
                <span>{dailyCalorieRange ? `每日参考 ${dailyCalorieRange.low}–${dailyCalorieRange.high} kcal` : "完善档案后可对照个人参考热量"}</span>
              </div>
              <b>{averageDailyCalories ? `日均 ${averageDailyCalories} kcal` : "等待记录"}</b>
            </div>
            <div className={styles.trendScroller}>
              <div
                className={observationRange === "week" ? styles.weekTrend : styles.monthTrend}
                style={observationRange === "month" ? { "--month-days": trendDays.length } as CSSProperties : undefined}
              >
                {trendDays.map((day) => {
                  const barHeight = day.totals.calories ? Math.max(7, (day.totals.calories / trendScaleMax) * 100) : 2;
                  return (
                    <button
                      key={day.key}
                      type="button"
                      className={[
                        styles.trendDay,
                        day.isToday ? styles.todayTrend : "",
                        selectedDateKey === day.key ? styles.selectedTrend : ""
                      ].filter(Boolean).join(" ")}
                      onClick={() => setSelectedDateKey(day.key)}
                      title={`${day.key}：${day.totals.calories || 0} kcal，${day.records.length} 餐`}
                    >
                      <span className={styles.trendValue}>{observationRange === "week" ? day.totals.calories || "" : ""}</span>
                      <i style={{ height: `${barHeight}%` }} />
                      <span>{day.day}</span>
                      <small>{observationRange === "week" ? `周${day.weekday}` : ""}</small>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className={styles.periodInsight}>
            <span>
              {isGeneratingObservation ? <Loader2 className={styles.spin} size={14} /> : <Check size={14} />}
              {isGeneratingObservation ? "正在看看这段时间的规律" : "这段时间的观察"}
            </span>
            <strong>{observationInsight.title}</strong>
            <p>{observationInsight.body}</p>
          </div>

          <div className={styles.selectedDayCompact}>
            <div>
              <span>{selectedDateLabel}</span>
              <strong>{selectedDateRecords.length ? `${selectedDateTotals.calories} kcal` : "暂无记录"}</strong>
            </div>
            <p>{selectedDateRecords.length ? `${selectedDateRecords.length} 餐 · ${selectedDateScore} 分` : "选择有热量数字的日期，可以查看当天记录。"}</p>
          </div>
          <div className={styles.foodTrend}>
            <span>近期开吃频率</span>
            <div>
              {observedFoodFrequency.length
                ? observedFoodFrequency.map((item) => (
                    <b key={item.food}>{item.food}<small>{item.count} 次</small></b>
                  ))
                : <em>累计几餐后会看到饮食偏好线索。</em>}
            </div>
            {observedFoodFrequency.length ? <p>出现频率只能说明饮食习惯，不会直接认定为你的偏好。</p> : null}
          </div>
        </div>
        ) : null}

        {activeTab === "next" ? (
        <div className={styles.panel}>
          <div className={styles.sectionTitle}>
            <div>
              <span>饭前参考</span>
              <h2>下一餐方向</h2>
            </div>
            <Clock3 size={22} />
          </div>
          <div className={styles.nutritionGapCard}>
            <span>根据今天的记录</span>
            <strong>{nutritionGap.title}</strong>
            <p>{nutritionGap.body}</p>
            <div>
              {nutritionGap.categories.map((category) => <b key={category}>{category}</b>)}
            </div>
          </div>
          <div className={styles.nextMealScene}>
            <div className={styles.nextMealSceneHeader}>
              <span>用餐方式</span>
              <b>本次推荐：{targetMeal}</b>
            </div>
            <div className={styles.scenePicker} aria-label="用餐方式">
              {mealScenes.map((scene) => (
                <button
                  key={scene}
                  type="button"
                  className={selectedScene === scene ? styles.activeScene : ""}
                  onClick={() => handleSceneChange(scene)}
                >
                  {scene}
                </button>
              ))}
            </div>
            <div className={styles.mealIntentGroup}>
              <span>这餐想怎么吃</span>
              <div className={styles.scenePicker} aria-label="本餐目标">
                {mealIntents.map((intent) => (
                  <button
                    key={intent}
                    type="button"
                    className={selectedIntent === intent ? styles.activeScene : ""}
                    onClick={() => handleIntentChange(intent)}
                  >
                    {intent}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className={styles.nextMealCard}>
            {isGeneratingNextMeal ? (
              <div className={styles.nextMealLoading} role="status" aria-live="polite">
                <div className={styles.reelLoadingHeader}>
                  <Loader2 className={styles.spin} size={20} />
                  <div>
                    <strong>正在生成{targetMeal}建议</strong>
                    <p>结合今日记录、用餐方式和本餐目标进行整理。</p>
                  </div>
                </div>
              </div>
            ) : nextMealIdea ? (
              <>
                <div>
                  <div className={styles.nextMealStatusRow}>
                    <span className={styles.generatedLabel}>
                      <Check size={14} />
                      {showNextMealFallback
                        ? "智能建议暂时不可用，先看看备选方案"
                        : isUsingCachedNextMeal
                          ? "已保留上次生成的搭配"
                          : "已结合今日记录和用餐方式"}
                    </span>
                    <div className={styles.nextMealActions}>
                      <button
                        type="button"
                        className={styles.refreshMealButton}
                        onClick={() => void generateNextMeal(selectedScene, true)}
                      >
                        <RefreshCw size={14} />
                        {showNextMealFallback ? "重试" : "换一批"}
                      </button>
                    </div>
                  </div>
                  <strong>{nextMealIdea.title}</strong>
                  <p>{nextMealIdea.tip}</p>
                </div>
                <div className={styles.nextMealMenus} aria-label="最终选定的三个餐饮方向">
                  {nextMealIdea.menus.map((menu, index) => (
                    <article key={`${menu.category}-${menu.name}`}>
                      <span>{index + 1}</span>
                      <div>
                        {menu.category ? <b className={styles.menuCategory}>{menu.category}</b> : null}
                        <strong className={styles.menuName}>{menu.name}</strong>
                        <p>{menu.detail}</p>
                      </div>
                    </article>
                  ))}
                </div>
                {selectedScene !== "自己做" ? <small className={styles.sceneNote}>这里提供餐饮类型和菜品方向，不对应具体店铺。</small> : null}
              </>
            ) : null}
          </div>
          <div className={styles.observationGrid}>
            <ObservationMetric label="记录天数" value={`${observedDayCount} 天`} />
            <ObservationMetric label="日均热量" value={`${averageDailyCalories} kcal`} />
            <ObservationMetric label="记录餐数" value={`${observedRecords.length} 餐`} />
          </div>
        </div>
        ) : null}
      </section>
      ) : null}

      {activeTab === "profile" ? (
      <section className={styles.profilePanel} aria-label="我的个人档案">
        <div className={styles.profileHeader}>
          <div>
            <span>
              <UserRound size={16} />
              我的
            </span>
            <strong>
              {profile.name || "欢迎来到吃了么"} · {profile.goal}
            </strong>
          </div>
          <button type="button" onClick={() => setShowProfilePanel((current) => !current)}>
            {showProfilePanel ? "收起" : "编辑档案"}
          </button>
        </div>

        {!hasProfileInfo(profile) ? (
          <div className={styles.profileWelcome}>
            <UserRound size={20} />
            <div>
              <strong>完善个人档案</strong>
              <p>这些信息会让饮食建议更贴近你的日常状态，之后也可以随时回来修改。</p>
            </div>
          </div>
        ) : null}

        {showProfilePanel ? (
          <div className={styles.profileForm}>
            <label>
              昵称
              <input value={profile.name} onChange={(event) => setProfile({ ...profile, name: event.target.value })} placeholder="例如 小周" />
            </label>
            <label>
              身高 cm
              <input value={profile.height} onChange={(event) => setProfile({ ...profile, height: event.target.value })} inputMode="decimal" placeholder="例如 170" />
            </label>
            <label>
              体重 kg
              <input value={profile.weight} onChange={(event) => setProfile({ ...profile, weight: event.target.value })} inputMode="decimal" placeholder="例如 62" />
            </label>
            <label>
              年龄
              <input value={profile.age} onChange={(event) => setProfile({ ...profile, age: event.target.value })} inputMode="numeric" placeholder="例如 22" />
            </label>
            <label>
              性别
              <select value={profile.gender} onChange={(event) => setProfile({ ...profile, gender: event.target.value })}>
                <option>未设置</option>
                <option>女</option>
                <option>男</option>
                <option>其他</option>
              </select>
            </label>
            <label>
              日常活动量
              <select value={profile.activityLevel} onChange={(event) => setProfile({ ...profile, activityLevel: event.target.value })}>
                <option>久坐少动</option>
                <option>日常活动</option>
                <option>经常运动</option>
                <option>高强度运动</option>
              </select>
            </label>
            <label>
              目标
              <select value={profile.goal} onChange={(event) => setProfile({ ...profile, goal: event.target.value })}>
                <option>保持均衡</option>
                <option>减脂入门</option>
                <option>增肌补蛋白</option>
                <option>少油清淡</option>
                <option>规律吃饭</option>
              </select>
            </label>
            <div className={styles.profileNeedBlock}>
              <span>近期需求</span>
              <div>
                {needOptions.map((need) => (
                  <button
                    key={need}
                    type="button"
                    className={profile.needs.includes(need) ? styles.activeNeed : ""}
                    onClick={() => toggleNeed(need)}
                  >
                    {need}
                  </button>
                ))}
              </div>
            </div>
            <label className={styles.fullField}>
              我的饮食偏好
              <textarea
                value={profile.customNeed}
                onChange={(event) => setProfile({ ...profile, customNeed: event.target.value })}
                rows={3}
                placeholder="例如：我最近一周在健身，希望每餐多关注蛋白质；晚上尽量少油少碳水。"
              />
            </label>
            <label>
              过敏原（选填）
              <input
                value={profile.allergies}
                onChange={(event) => setProfile({ ...profile, allergies: event.target.value })}
                placeholder="例如 花生、虾、牛奶"
              />
            </label>
            <label>
              不吃或不喜欢（选填）
              <input
                value={profile.avoidedFoods}
                onChange={(event) => setProfile({ ...profile, avoidedFoods: event.target.value })}
                placeholder="例如 香菜、动物内脏"
              />
            </label>
            <p className={styles.promptHint}>
              过敏与忌口会优先用于筛选建议；配料不清楚时仍需向商家再次确认。
            </p>
            <div className={styles.profileActions}>
              <button type="button" onClick={saveProfile}>
                <Save size={16} />
                保存个人档案
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className={styles.profileChips}>
              <span>{profile.height ? `${profile.height}cm` : "身高待填"}</span>
              <span>{profile.weight ? `${profile.weight}kg` : "体重待填"}</span>
              <span>{profile.age ? `${profile.age}岁` : "年龄待填"}</span>
              <span>{profile.activityLevel}</span>
              {dailyCalorieRange ? <span>{dailyCalorieRange.low}–{dailyCalorieRange.high} kcal/日</span> : null}
              {profile.allergies.trim() ? <span>避开：{profile.allergies.trim()}</span> : null}
              {[...profile.needs, profile.customNeed.trim()].filter(Boolean).slice(0, 2).map((need) => (
                <span key={need}>{need}</span>
              ))}
            </div>
            <div className={styles.profileSummaryGrid}>
              <article>
                <span>当前饮食方向</span>
                <strong>{profile.goal}</strong>
                <p>{profile.customNeed.trim() || profile.needs.join("、") || "保持规律记录，逐步看清自己的饮食节奏。"}</p>
              </article>
              <article>
                <span>每日参考</span>
                <strong>{dailyCalorieRange ? `${dailyCalorieRange.low}–${dailyCalorieRange.high} kcal` : "信息待完善"}</strong>
                <p>{dailyCalorieRange ? "根据基础信息、活动量和当前目标估算的日常区间。" : "补全身高、体重、年龄和性别后即可查看。"}</p>
              </article>
            </div>
          </>
        )}
        <div className={styles.privacyNote}>
          <ShieldCheck size={17} />
          记录保存在当前浏览器；生成识别和建议时，会发送本次餐食与已填写的饮食档案摘要。
        </div>
      </section>
      ) : null}
      </div>

      {showOnboarding && activeTab !== "profile" ? (
        <aside className={styles.onboardingOverlay} aria-label="个人信息引导">
          <div className={styles.onboardingCard}>
            <span className={styles.guideEyebrow}>第一次使用</span>
            <strong>先完善个人档案</strong>
            <p>从底部进入“我的”，填好基本信息，让之后的饮食建议更适合你。</p>
            <div className={styles.onboardingActions}>
              <button type="button" onClick={openProfileFromGuide}>去“我的”填写</button>
              <button type="button" onClick={skipOnboarding}>稍后再说</button>
            </div>
          </div>
        </aside>
      ) : null}

      <nav className={styles.bottomNav} aria-label="应用板块">
        {appTabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.key}
              type="button"
              className={[
                activeTab === tab.key ? styles.activeTab : "",
                showOnboarding && tab.key === "profile" ? styles.guidedTab : ""
              ].filter(Boolean).join(" ")}
              onClick={() => handleTabChange(tab.key)}
            >
              <Icon size={18} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </nav>
    </main>
  );
}

function NutritionRow({
  label,
  value,
  unit = "g",
  color
}: {
  label: string;
  value: number;
  unit?: string;
  color: "green" | "blue" | "coral" | "amber";
}) {
  const width = unit === "%" ? value : clamp((value / 100) * 100, 8, 100);
  return (
    <div className={styles.nutritionRow}>
      <div>
        <span>{label}</span>
        <strong>
          {value}
          {unit}
        </strong>
      </div>
      <div className={styles.miniTrack}>
        <i className={styles[color]} style={{ width: `${width}%` }} />
      </div>
    </div>
  );
}

function MealSlotCard({
  slot,
  records,
  onUpdate,
  onDelete,
  onReestimate
}: {
  slot: MealSlot;
  records: MealRecord[];
  onUpdate: (record: MealRecord) => void;
  onDelete: (recordId: string) => void;
  onReestimate: (recordId: string, foods: string[]) => Promise<void>;
}) {
  return (
    <article className={styles.mealCard}>
      <div className={styles.mealCardHead}>
        <strong>{slot}</strong>
        <span>{records.length ? `${records.reduce((sum, item) => sum + item.calories, 0)} kcal` : "暂无记录"}</span>
      </div>
      {records.length ? (
        records.map((record) => (
          <EditableRecord
            key={record.id}
            record={record}
            onUpdate={onUpdate}
            onDelete={onDelete}
            onReestimate={onReestimate}
          />
        ))
      ) : (
        <div className={styles.emptyMeal}>上传图片后，可一键生成{slot}记录。</div>
      )}
    </article>
  );
}

function EditableRecord({
  record,
  onUpdate,
  onDelete,
  onReestimate
}: {
  record: MealRecord;
  onUpdate: (record: MealRecord) => void;
  onDelete: (recordId: string) => void;
  onReestimate: (recordId: string, foods: string[]) => Promise<void>;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [isReestimating, setIsReestimating] = useState(false);
  const [draft, setDraft] = useState({
    slot: record.slot,
    foods: record.foods.join("、"),
    verdict: record.verdict
  });

  useEffect(() => {
    setDraft({
      slot: record.slot,
      foods: record.foods.join("、"),
      verdict: record.verdict
    });
  }, [record]);

  function saveDraft() {
    const foods = parseFoods(draft.foods);
    onUpdate({
      ...record,
      slot: draft.slot,
      foods: foods.length ? foods : record.foods,
      verdict: draft.verdict.trim() || record.verdict
    });
    setIsEditing(false);
  }

  async function reestimateDraft() {
    const foods = parseFoods(draft.foods);
    if (!foods.length) return;
    setIsReestimating(true);
    try {
      await onReestimate(record.id, foods);
      setIsEditing(false);
    } finally {
      setIsReestimating(false);
    }
  }

  if (!isEditing) {
    return (
      <div className={styles.recordItem}>
        <div>
          <b>{record.foods.join("、")}</b>
          <span>{record.verdict}</span>
        </div>
        <div className={styles.recordMeta}>
          <em>{record.protein}P / {record.carbs}C / {record.fat}F</em>
          <button type="button" onClick={() => setIsEditing(true)} aria-label="编辑饮食记录">
            <Edit3 size={14} />
            编辑
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.editRecord}>
      <label>
        餐别
        <select value={draft.slot} onChange={(event) => setDraft({ ...draft, slot: event.target.value as MealSlot })}>
          {mealSlots.map((slot) => (
            <option key={slot}>{slot}</option>
          ))}
        </select>
      </label>
      <label className={styles.fullField}>
        菜品
        <textarea
          value={draft.foods}
          onChange={(event) => setDraft({ ...draft, foods: event.target.value })}
          rows={2}
          placeholder="例如：蛋炒饭、青菜"
        />
      </label>
      <div className={styles.nutrientEditGrid}>
        <ReadOnlyMetric label="热量" value={`${record.calories} kcal`} />
        <ReadOnlyMetric label="蛋白质" value={`${record.protein}g`} />
        <ReadOnlyMetric label="碳水" value={`${record.carbs}g`} />
        <ReadOnlyMetric label="脂肪" value={`${record.fat}g`} />
        <ReadOnlyMetric label="蔬菜" value={`${record.vegetableRatio}%`} />
      </div>
      <label className={styles.fullField}>
        简短评价
        <textarea
          value={draft.verdict}
          onChange={(event) => setDraft({ ...draft, verdict: event.target.value })}
          rows={2}
        />
      </label>
      <div className={styles.editActions}>
        <button type="button" className={styles.dangerButton} onClick={() => onDelete(record.id)}>
          <Trash2 size={15} />
          删除
        </button>
        <button type="button" className={styles.secondaryButton} onClick={reestimateDraft}>
          {isReestimating ? <Loader2 className={styles.spin} size={15} /> : <RefreshCw size={15} />}
          {isReestimating ? "分析中" : "重新分析"}
        </button>
        <button type="button" className={styles.secondaryButton} onClick={() => setIsEditing(false)}>
          <X size={15} />
          取消
        </button>
        <button type="button" className={styles.primarySmallButton} onClick={saveDraft}>
          <Save size={15} />
          保存
        </button>
      </div>
    </div>
  );
}

function ReadOnlyMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.readOnlyMetric}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function ObservationMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.observationMetric}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
