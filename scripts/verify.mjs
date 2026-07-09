import { chromium } from "playwright";

const browser = await chromium.launch({
  headless: true,
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
});
const appUrl = process.env.APP_URL || "http://localhost:3000";

const seededRecords = [
  {
    id: "verify-lunch",
    slot: "午餐",
    scene: "自己做",
    mood: "正常吃",
    foods: ["蛋炒饭", "无糖豆浆"],
    calories: 720,
    protein: 28,
    carbs: 98,
    fat: 24,
    vegetableRatio: 12,
    verdict: "主食占比较高，蛋白质尚可，下一餐建议增加蔬菜。",
    createdAt: new Date().toISOString()
  },
  {
    id: "verify-snack",
    slot: "加餐",
    scene: "点外卖",
    mood: "想奖励自己",
    foods: ["酸奶", "坚果"],
    calories: 260,
    protein: 12,
    carbs: 22,
    fat: 14,
    vegetableRatio: 0,
    verdict: "加餐热量适中，坚果脂肪较高，注意份量。",
    createdAt: new Date().toISOString()
  }
];

const seededProfile = {
  name: "小周",
  height: "170",
  weight: "62",
  age: "22",
  gender: "未设置",
  goal: "保持均衡",
  needs: ["最近在健身", "想多补蛋白"],
  customNeed: "最近在健身，希望每餐多关注蛋白质。"
};

async function seed(page) {
  await page.addInitScript(
    ({ records, profile }) => {
      window.localStorage.setItem("chileme-records", JSON.stringify(records));
      window.localStorage.setItem("chileme-profile", JSON.stringify(profile));
      window.localStorage.setItem("chileme-kimi-key", "verify-only-key");
    },
    { records: seededRecords, profile: seededProfile }
  );
}

const desktop = await browser.newPage({ viewport: { width: 1280, height: 980 } });
const errors = [];
desktop.on("console", (msg) => {
  if (msg.type() === "error") errors.push(msg.text());
});
await seed(desktop);
await desktop.goto(appUrl, { waitUntil: "networkidle" });
await desktop.getByRole("button", { name: /填入示例/ }).first().click();
const desktopText = await desktop.locator("body").innerText();
const sampleText = await desktop.locator("textarea").first().inputValue();
await desktop.screenshot({ path: "verification-desktop.png", fullPage: true });

const mobile = await browser.newPage({ viewport: { width: 390, height: 900 }, isMobile: true });
const mobileErrors = [];
mobile.on("console", (msg) => {
  if (msg.type() === "error") mobileErrors.push(msg.text());
});
await seed(mobile);
await mobile.goto(appUrl, { waitUntil: "networkidle" });
const mobileText = await mobile.locator("body").innerText();
await mobile.screenshot({ path: "verification-mobile.png", fullPage: true });

await browser.close();

const result = {
  desktop: {
    hasContent: desktopText.includes("吃了么"),
    hasInsightPanel: desktopText.includes("每日食物观察") && desktopText.includes("下一餐方向"),
    hasSnack: desktopText.includes("加餐") && desktopText.includes("酸奶"),
    hasNextMeal: desktopText.includes("下一餐方向"),
    hasCalendar: desktopText.includes("今天") && desktopText.includes("常出现食物"),
    hasBottomStats: desktopText.includes("今日总热量") && desktopText.includes("结构评分") && desktopText.includes("蔬菜占比"),
    hasProfileNeed: desktopText.includes("最近在健身"),
    sampleFilled: sampleText.includes("午餐吃了蛋炒饭一盘"),
    errors
  },
  mobile: {
    hasContent: mobileText.includes("吃了么"),
    hasUpload: mobileText.includes("上传餐食图片") || mobileText.includes("记录这一餐"),
    hasCalendar: mobileText.includes("每日食物观察") && mobileText.includes("常出现食物"),
    hasLocalNote: mobileText.includes("当前浏览器"),
    errors: mobileErrors
  }
};

console.log(JSON.stringify(result, null, 2));

if (
  !result.desktop.hasContent ||
  !result.desktop.hasInsightPanel ||
  !result.desktop.hasSnack ||
  !result.desktop.hasNextMeal ||
  !result.desktop.hasCalendar ||
  !result.desktop.hasBottomStats ||
  !result.desktop.hasProfileNeed ||
  !result.desktop.sampleFilled ||
  result.desktop.errors.length ||
  !result.mobile.hasContent ||
  !result.mobile.hasUpload ||
  !result.mobile.hasCalendar ||
  !result.mobile.hasLocalNote ||
  result.mobile.errors.length
) {
  process.exit(1);
}
