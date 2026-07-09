"use client";

import {
  Activity,
  Camera,
  Check,
  ChevronRight,
  Clock3,
  Edit3,
  Loader2,
  Mic,
  UserRound,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  Sparkles,
  ShieldCheck,
  Trash2,
  Upload,
  Utensils,
  X
} from "lucide-react";
import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import styles from "./page.module.css";

type MealSlot = "早餐" | "午餐" | "晚餐" | "加餐";
type MealScene = "自己做" | "点外卖" | "到店吃";
type MealMood = "正常吃" | "赶时间" | "想省钱" | "减脂中" | "想奖励自己";

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
  scene?: MealScene;
  mood?: MealMood;
  createdAt: string;
};

type UserProfile = {
  name: string;
  height: string;
  weight: string;
  age: string;
  gender: string;
  goal: string;
  needs: string[];
  customNeed: string;
};

type ObservationRange = "week" | "month";

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
const mealScenes: MealScene[] = ["自己做", "点外卖", "到店吃"];
const mealMoods: MealMood[] = ["正常吃", "赶时间", "想省钱", "减脂中", "想奖励自己"];
const needOptions = ["最近在健身", "最近想减肥", "想少油清淡", "想规律吃饭", "想多补蛋白", "控制夜宵"];

const emptyProfile: UserProfile = {
  name: "",
  height: "",
  weight: "",
  age: "",
  gender: "未设置",
  goal: "保持均衡",
  needs: [],
  customNeed: ""
};

function getDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getMonthKey(date: Date) {
  return `${date.getFullYear()}年${date.getMonth() + 1}月`;
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

function buildCalendarDays(cursor: Date) {
  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const firstDay = new Date(year, month, 1);
  const start = new Date(firstDay);
  start.setDate(firstDay.getDate() - firstDay.getDay());

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return {
      date,
      key: getDateKey(date),
      day: date.getDate(),
      isCurrentMonth: date.getMonth() === month,
      isToday: getDateKey(date) === getDateKey(new Date())
    };
  });
}

function buildWeekDays(selectedKey: string) {
  const selectedDate = new Date(`${selectedKey}T00:00:00`);
  const start = new Date(selectedDate);
  start.setDate(selectedDate.getDate() - selectedDate.getDay());

  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return {
      date,
      key: getDateKey(date),
      day: date.getDate(),
      isCurrentMonth: true,
      isToday: getDateKey(date) === getDateKey(new Date())
    };
  });
}

function buildProfileContext(profile: UserProfile) {
  const parts = [
    profile.age ? `年龄 ${profile.age} 岁` : "",
    profile.gender && profile.gender !== "未设置" ? `性别 ${profile.gender}` : "",
    profile.height ? `身高 ${profile.height}cm` : "",
    profile.weight ? `体重 ${profile.weight}kg` : "",
    profile.goal ? `当前饮食目标：${profile.goal}` : "",
    profile.needs.length ? `近期需求：${profile.needs.join("、")}` : "",
    profile.customNeed.trim() ? `用户补充要求：${profile.customNeed.trim()}` : ""
  ].filter(Boolean);

  return parts.length ? parts.join("；") : "用户暂未填写个人饮食背景。";
}

function getTopFoods(records: MealRecord[]) {
  const counts = records.reduce<Record<string, number>>((acc, record) => {
    record.foods.forEach((food) => {
      acc[food] = (acc[food] || 0) + 1;
    });
    return acc;
  }, {});

  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([food]) => food);
}

function getTopScene(records: MealRecord[]) {
  const counts = records.reduce<Record<string, number>>((acc, record) => {
    if (record.scene) {
      acc[record.scene] = (acc[record.scene] || 0) + 1;
    }
    return acc;
  }, {});
  const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  return top ? top[0] : "待累计";
}

function buildNextMealIdea(records: MealRecord[], profile: UserProfile, mood: MealMood) {
  if (!records.length) {
    return {
      title: "先记录第一餐",
      tags: ["拍照或文字输入", "生成今日基线"],
      tip: "有了第一条记录后，系统会根据今天的结构给出下一餐方向。"
    };
  }

  const totals = getTotals(records);
  const focusText = [...profile.needs, profile.customNeed].join("、");
  if (profile.goal === "增肌补蛋白" || focusText.includes("健身") || focusText.includes("蛋白") || totals.protein < 55) {
    return {
      title: "下一餐补优质蛋白",
      tags: ["鸡蛋/豆腐", "鱼肉/鸡胸", "少油烹饪"],
      tip: "今天蛋白质还不算充足，下一餐优先把蛋白质放进盘子里。"
    };
  }
  if (profile.goal === "减脂入门" || focusText.includes("减肥") || focusText.includes("减脂") || mood === "减脂中" || totals.fat > 70) {
    return {
      title: "下一餐清淡一点",
      tags: ["蒸煮类", "汤类", "加蔬菜"],
      tip: "控制油脂比精确算热量更容易坚持，先从少油和多蔬菜开始。"
    };
  }
  if (totals.carbs > 230) {
    return {
      title: "下一餐少一点主食",
      tags: ["半份米饭", "多一份青菜", "加蛋白"],
      tip: "今天碳水已经偏高，下一餐可以减少主食，把饱腹感交给蛋白质和蔬菜。"
    };
  }
  if (totals.vegetableRatio < 25) {
    return {
      title: "下一餐加一份蔬菜",
      tags: ["绿叶菜", "菌菇", "凉拌/清炒"],
      tip: "蔬菜占比补上后，今日饮食结构会更稳。"
    };
  }
  if (mood === "赶时间") {
    return {
      title: "选快但别太油",
      tags: ["便利店蛋白", "轻食饭团", "无糖饮品"],
      tip: "赶时间也可以保留一个蛋白质来源，避免只靠主食顶过去。"
    };
  }
  if (mood === "想省钱") {
    return {
      title: "选便宜的均衡组合",
      tags: ["米饭半份", "豆制品", "时蔬"],
      tip: "省钱时优先保留豆腐、鸡蛋、青菜这类性价比高的基础食材。"
    };
  }

  return {
    title: "延续均衡节奏",
    tags: ["主食适量", "蛋白质稳定", "蔬菜不断档"],
    tip: "今天结构不错，下一餐按主食、蛋白、蔬菜的组合继续走就可以。"
  };
}

export default function Home() {
  const [preview, setPreview] = useState<string | null>(null);
  const [isRecognizing, setIsRecognizing] = useState(false);
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
  const [observationRange, setObservationRange] = useState<ObservationRange>("week");
  const [calendarCursor, setCalendarCursor] = useState(() => new Date());
  const [selectedDateKey, setSelectedDateKey] = useState(() => getDateKey(new Date()));
  const [selectedSlot, setSelectedSlot] = useState<MealSlot>("午餐");
  const [selectedScene, setSelectedScene] = useState<MealScene>("点外卖");
  const [selectedMood, setSelectedMood] = useState<MealMood>("正常吃");
  const [toast, setToast] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadSectionRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const saved = window.localStorage.getItem("chileme-records");
    if (saved) {
      setRecords(JSON.parse(saved) as MealRecord[]);
    }
    const savedProfile = window.localStorage.getItem("chileme-profile");
    if (savedProfile) {
      setProfile({ ...emptyProfile, ...(JSON.parse(savedProfile) as UserProfile) });
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem("chileme-records", JSON.stringify(records));
  }, [records]);

  useEffect(() => {
    window.localStorage.setItem("chileme-profile", JSON.stringify(profile));
  }, [profile]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 2400);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const todayRecords = useMemo(() => records.filter((record) => isSameDay(record.createdAt, new Date())), [records]);
  const observedRecords = useMemo(
    () => getRecentRecords(records, observationRange === "week" ? 7 : 30),
    [records, observationRange]
  );
  const totals = useMemo(() => getTotals(todayRecords), [todayRecords]);
  const score = useMemo(() => calcScore(todayRecords), [todayRecords]);
  const advice = useMemo(() => buildAdvice(todayRecords), [todayRecords]);
  const observedTotals = useMemo(() => getTotals(observedRecords), [observedRecords]);
  const observedDayCount = useMemo(() => getRecordedDayCount(observedRecords), [observedRecords]);
  const topFoods = useMemo(() => getTopFoods(observedRecords), [observedRecords]);
  const topScene = useMemo(() => getTopScene(observedRecords), [observedRecords]);
  const nextMealIdea = useMemo(() => buildNextMealIdea(todayRecords, profile, selectedMood), [todayRecords, profile, selectedMood]);
  const profileContext = useMemo(() => buildProfileContext(profile), [profile]);
  const recordsByDate = useMemo(() => getRecordsByDate(records), [records]);
  const monthDays = useMemo(() => buildCalendarDays(calendarCursor), [calendarCursor]);
  const weekDays = useMemo(() => buildWeekDays(selectedDateKey), [selectedDateKey]);
  const calendarDays = observationRange === "week" ? weekDays : monthDays;
  const selectedDateRecords = recordsByDate[selectedDateKey] || [];
  const selectedDateTotals = useMemo(() => getTotals(selectedDateRecords), [selectedDateRecords]);
  const selectedDateScore = useMemo(() => calcScore(selectedDateRecords), [selectedDateRecords]);
  const selectedDateLabel = selectedDateKey === getDateKey(new Date()) ? "今天" : selectedDateKey;
  const macrosTotal = Math.max(totals.protein + totals.carbs + totals.fat, 1);
  const averageDailyCalories = observedDayCount ? Math.round(observedTotals.calories / observedDayCount) : 0;

  function scrollToUpload() {
    uploadSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
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

  function moveCalendarMonth(direction: -1 | 1) {
    setCalendarCursor((current) => new Date(current.getFullYear(), current.getMonth() + direction, 1));
  }

  function jumpToToday() {
    const today = new Date();
    setCalendarCursor(today);
    setSelectedDateKey(getDateKey(today));
  }

  async function estimateByText(description: string) {
    const response = await fetch("/api/estimate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ description, profileContext })
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

    const reader = new FileReader();
    reader.onload = async () => {
      const imageDataUrl = String(reader.result);
      setPreview(imageDataUrl);
      setRecognition(null);
      setRecognitionMode(null);
      setRecognitionError("");
      setRecognitionDebug("");
      setIsRecognizing(true);

      try {
        const response = await fetch("/api/recognize", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ imageDataUrl, profileContext })
        });
        const data = (await response.json()) as {
          mode?: "kimi";
          result?: Recognition;
          error?: string;
          keySource?: "browser" | "env";
          keyTail?: string;
        };
        if (!response.ok || !data.result) {
          setRecognitionDebug("");
          throw new Error(data.error || "智能分析暂时不可用，请稍后再试。");
        }
        setRecognition(data.result);
        setRecognitionMode(data.mode || "kimi");
      } catch (error) {
        const message = error instanceof Error ? error.message : "智能分析暂时不可用，请稍后再试。";
        setRecognitionError(message);
        setToast(message);
      } finally {
        setIsRecognizing(false);
      }
    };
    reader.readAsDataURL(file);
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
      scene: selectedScene,
      createdAt: new Date().toISOString()
    };
    setRecords((current) => [record, ...current]);
    setSelectedDateKey(getDateKey(new Date()));
    setCalendarCursor(new Date());
    setToast(`${selectedSlot}记录已生成`);
    setRecognition(null);
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
    const estimated = await estimateByText(foods.join("、"));
    setRecords((current) => current.map((record) => (record.id === recordId ? { ...record, ...estimated } : record)));
    setToast("营养信息已重新分析");
  }

  function resetDemo() {
    setRecords([]);
    setRecognition(null);
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

      <section className={styles.hero}>
        <div>
          <div className={styles.brandRow}>
            <span className={styles.logo}>
              <Utensils size={22} />
            </span>
            <span className={styles.agentName}>饮食助手</span>
          </div>
          <h1>吃了么</h1>
          <p>拍一张餐食照片，自动生成饮食记录，轻松看懂今天吃得怎么样。</p>
          <div className={styles.heroActions}>
            <button type="button" onClick={scrollToUpload}>
              <Camera size={17} />
              开始记录
            </button>
            <button type="button" onClick={fillSampleText}>
              <Sparkles size={17} />
              填入示例
            </button>
          </div>
        </div>
        <button className={styles.iconButton} type="button" onClick={resetDemo} aria-label="清空今日记录">
          <RotateCcw size={18} />
        </button>
      </section>

      <section className={styles.profilePanel}>
        <div className={styles.profileHeader}>
          <div>
            <span>
              <UserRound size={16} />
              个人档案
            </span>
            <strong>
              {profile.name || "未命名用户"} · {profile.goal}
            </strong>
          </div>
          <button type="button" onClick={() => setShowProfilePanel((current) => !current)}>
            {showProfilePanel ? "收起" : "编辑档案"}
          </button>
        </div>
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
            <p className={styles.promptHint}>
              这些偏好会帮助系统给出更贴近你的日常饮食建议，不会作为医疗诊断依据。
            </p>
          </div>
        ) : (
          <div className={styles.profileChips}>
            <span>{profile.height ? `${profile.height}cm` : "身高待填"}</span>
            <span>{profile.weight ? `${profile.weight}kg` : "体重待填"}</span>
            <span>{profile.age ? `${profile.age}岁` : "年龄待填"}</span>
            {[...profile.needs, profile.customNeed.trim()].filter(Boolean).slice(0, 2).map((need) => (
              <span key={need}>{need}</span>
            ))}
          </div>
        )}
      </section>

      <section className={styles.panel} ref={uploadSectionRef}>
        <div className={styles.sectionTitle}>
          <div>
            <span>上传记录区</span>
            <h2>记录这一餐</h2>
          </div>
          <Sparkles size={22} />
        </div>

        <div className={styles.uploadGrid}>
          <div className={styles.inputColumn}>
            <button className={styles.uploadBox} type="button" onClick={() => fileInputRef.current?.click()}>
              {preview ? (
                <img src={preview} alt="餐食预览" />
              ) : (
                <div className={styles.uploadEmpty}>
                  <Camera size={34} />
                  <strong>上传餐食图片</strong>
                  <span>上传后会自动分析菜品、热量和营养结构</span>
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
                  <Sparkles size={16} />
                  示例
                </button>
                <button type="button" className={styles.secondaryButton} onClick={startVoiceInput}>
                  <Mic size={16} />
                  {isListening ? "聆听中" : "语音输入"}
                </button>
                <button type="button" onClick={handleTextEstimate} disabled={isTextEstimating}>
                  {isTextEstimating ? <Loader2 className={styles.spin} size={16} /> : <Sparkles size={16} />}
                  {isTextEstimating ? "分析中" : "文字分析"}
                </button>
              </div>
            </div>
          </div>

          <div className={styles.recognitionCard}>
            {isRecognizing ? (
              <div className={styles.loadingState}>
                <Loader2 className={styles.spin} size={32} />
                <strong>正在分析这一餐</strong>
                <span>正在估算菜品、热量和营养结构...</span>
              </div>
            ) : recognition ? (
              <>
                <div className={styles.resultHeader}>
                  <span>
                    <Check size={16} />
                    分析完成
                  </span>
                  <strong>{recognition.calories} kcal</strong>
                </div>
                <p className={styles.modelNote}>
                  {recognitionMode === "kimi"
                    ? "已完成初步分析，建议确认菜品后再生成记录。"
                    : "建议确认菜品后再生成饮食记录。"}
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
                  <label>
                    场景
                    <select value={selectedScene} onChange={(event) => setSelectedScene(event.target.value as MealScene)}>
                      {mealScenes.map((scene) => (
                        <option key={scene}>{scene}</option>
                      ))}
                    </select>
                  </label>
                </div>
                <div className={styles.actions}>
                  <button type="button" onClick={createRecord}>
                    <Plus size={18} />
                    生成饮食记录
                  </button>
                </div>
              </>
            ) : recognitionError ? (
              <div className={styles.errorState}>
                <X size={28} />
                <strong>{recognitionError}</strong>
                {recognitionDebug ? <small>{recognitionDebug}</small> : null}
                <span>智能分析暂时不可用，可以稍后再试，或先用文字手动记录这一餐。</span>
              </div>
            ) : (
              <div className={styles.idleState}>
                <Upload size={28} />
                <strong>等待上传</strong>
                <span>上传后会展示菜品、热量、营养结构和餐食评价。</span>
              </div>
            )}
          </div>
        </div>
      </section>

      <section className={styles.panel}>
        <div className={styles.sectionTitle}>
          <div>
            <span>饮食记录区</span>
            <h2>今天已经记录的餐食</h2>
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

      <section className={styles.insightGrid}>
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
                onClick={() => setObservationRange("week")}
              >
                本周
              </button>
              <button
                type="button"
                className={observationRange === "month" ? styles.activeRange : ""}
                onClick={() => setObservationRange("month")}
              >
                本月
              </button>
            </div>
          </div>

          <div className={styles.calendarPanel}>
            <div className={styles.calendarHeader}>
              {observationRange === "month" ? (
                <button type="button" onClick={() => moveCalendarMonth(-1)} aria-label="上个月">
                  上月
                </button>
              ) : null}
              <strong>{observationRange === "week" ? "本周" : getMonthKey(calendarCursor)}</strong>
              {observationRange === "month" ? (
                <button type="button" onClick={() => moveCalendarMonth(1)} aria-label="下个月">
                  下月
                </button>
              ) : null}
              <button type="button" onClick={jumpToToday}>
                今天
              </button>
            </div>
            <div className={styles.weekHeader}>
              {["日", "一", "二", "三", "四", "五", "六"].map((day) => (
                <span key={day}>{day}</span>
              ))}
            </div>
            <div className={observationRange === "week" ? styles.weekCalendarGrid : styles.calendarGrid}>
              {calendarDays.map((day) => {
                const dayRecords = recordsByDate[day.key] || [];
                const dayTotals = getTotals(dayRecords);
                return (
                  <button
                    key={day.key}
                    type="button"
                    className={[
                      styles.calendarDay,
                      day.isCurrentMonth ? "" : styles.mutedDay,
                      day.isToday ? styles.todayDay : "",
                      selectedDateKey === day.key ? styles.selectedDay : ""
                    ].filter(Boolean).join(" ")}
                    onClick={() => setSelectedDateKey(day.key)}
                  >
                    <span>{day.day}</span>
                    {dayRecords.length ? (
                      <>
                        <b>{dayTotals.calories}</b>
                        <i>{dayRecords.length}餐</i>
                      </>
                    ) : (
                      <em />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          <div className={styles.selectedDayCompact}>
            <div>
              <span>{selectedDateLabel}</span>
              <strong>{selectedDateRecords.length ? `${selectedDateTotals.calories} kcal` : "暂无记录"}</strong>
            </div>
            <p>{selectedDateRecords.length ? `${selectedDateRecords.length} 餐 · ${selectedDateScore} 分` : "选择有热量数字的日期，可以查看当天记录。"}</p>
          </div>
          <div className={styles.foodTrend}>
            <span>常出现食物</span>
            <div>
              {topFoods.length ? topFoods.map((food) => <b key={food}>{food}</b>) : <em>累计几餐后会看到饮食偏好。</em>}
            </div>
          </div>
        </div>

        <div className={styles.panel}>
          <div className={styles.sectionTitle}>
            <div>
              <span>饭前参考</span>
              <h2>下一餐方向</h2>
            </div>
            <Clock3 size={22} />
          </div>
          <div className={styles.nextMealMood}>
            <span>下一餐状态</span>
            <div className={styles.moodPicker} aria-label="下一餐状态">
              {mealMoods.map((mood) => (
                <button
                  key={mood}
                  type="button"
                  className={selectedMood === mood ? styles.activeMood : ""}
                  onClick={() => setSelectedMood(mood)}
                >
                  {mood}
                </button>
              ))}
            </div>
          </div>
          <div className={styles.nextMealCard}>
            <div>
              <span>基于今日记录和下一餐状态</span>
              <strong>{nextMealIdea.title}</strong>
              <p>{nextMealIdea.tip}</p>
            </div>
            <div className={styles.nextMealTags}>
              {nextMealIdea.tags.map((tag) => (
                <b key={tag}>{tag}</b>
              ))}
            </div>
          </div>
          <div className={styles.observationGrid}>
            <ObservationMetric label="记录天数" value={`${observedDayCount} 天`} />
            <ObservationMetric label="日均热量" value={`${averageDailyCalories} kcal`} />
            <ObservationMetric label="主要场景" value={topScene} />
          </div>
        </div>
      </section>

      <section className={styles.panel}>
        <div className={styles.sectionTitle}>
          <div>
            <span>饮食分析区</span>
            <h2>今日营养结构</h2>
          </div>
          <Activity size={22} />
        </div>

        <div className={styles.analysisStats}>
          <ObservationMetric label="今日总热量" value={`${totals.calories} kcal`} />
          <ObservationMetric label="结构评分" value={todayRecords.length ? `${score} 分` : "--"} />
          <ObservationMetric label="蔬菜占比" value={`${totals.vegetableRatio}%`} />
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
          </div>
        </div>
        <div className={styles.privacyNote}>
          <ShieldCheck size={17} />
          当前饮食记录和个人档案只保存在当前浏览器；换设备或清理缓存后可能看不到这些记录。
        </div>
      </section>
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
    scene: record.scene || "点外卖",
    mood: record.mood || "正常吃",
    foods: record.foods.join("、"),
    verdict: record.verdict
  });

  useEffect(() => {
    setDraft({
      slot: record.slot,
      scene: record.scene || "点外卖",
      mood: record.mood || "正常吃",
      foods: record.foods.join("、"),
      verdict: record.verdict
    });
  }, [record]);

  function saveDraft() {
    const foods = parseFoods(draft.foods);
    onUpdate({
      ...record,
      slot: draft.slot,
      scene: draft.scene,
      mood: draft.mood,
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
          <div className={styles.recordChips}>
            {record.scene ? <i>{record.scene}</i> : null}
            {record.mood ? <i>{record.mood}</i> : null}
          </div>
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
      <label>
        场景
        <select value={draft.scene} onChange={(event) => setDraft({ ...draft, scene: event.target.value as MealScene })}>
          {mealScenes.map((scene) => (
            <option key={scene}>{scene}</option>
          ))}
        </select>
      </label>
      <label>
        状态
        <select value={draft.mood} onChange={(event) => setDraft({ ...draft, mood: event.target.value as MealMood })}>
          {mealMoods.map((mood) => (
            <option key={mood}>{mood}</option>
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
