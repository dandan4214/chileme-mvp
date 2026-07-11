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
    foods: ["酸奶", "坚果"],
    calories: 260,
    protein: 12,
    carbs: 22,
    fat: 14,
    vegetableRatio: 0,
    verdict: "加餐热量适中，坚果脂肪较高，注意份量。",
    createdAt: new Date().toISOString()
  },
  {
    id: "verify-history-lunch",
    slot: "午餐",
    foods: ["蛋炒饭", "青菜"],
    calories: 650,
    protein: 22,
    carbs: 88,
    fat: 21,
    vegetableRatio: 24,
    verdict: "这是一条用于观察饮食频率的历史记录。",
    createdAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  }
];

const seededProfile = {
  name: "小周",
  height: "170",
  weight: "62",
  age: "22",
  gender: "女",
  activityLevel: "日常活动",
  goal: "保持均衡",
  needs: ["最近在健身", "想多补蛋白"],
  customNeed: "最近在健身，希望每餐多关注蛋白质。",
  allergies: "",
  avoidedFoods: ""
};

const restrictedProfile = {
  ...seededProfile,
  allergies: "花生、虾",
  avoidedFoods: "香菜"
};

async function seed(page) {
  await page.route("**/api/coach", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ error: "verification fallback" })
    });
  });
  await page.addInitScript(
    ({ records, profile }) => {
      window.localStorage.setItem("chileme-records", JSON.stringify(records));
      window.localStorage.setItem("chileme-profile", JSON.stringify(profile));
      window.localStorage.setItem("chileme-onboarding-seen", "true");
      window.localStorage.removeItem("chileme-next-meal-cache-v3");
      window.localStorage.removeItem("chileme-recommendation-history-v2");
    },
    { records: seededRecords, profile: seededProfile }
  );
}

async function clickTab(page, label) {
  await page.getByRole("navigation", { name: "应用板块" }).getByRole("button", { name: label, exact: true }).click({ force: true });
  await page.waitForTimeout(120);
  return page.locator("body").innerText();
}

async function mockLocalHour(page, hour) {
  await page.addInitScript((mockHour) => {
    const RealDate = Date;
    const fixedDate = new RealDate();
    fixedDate.setHours(mockHour, 0, 0, 0);
    class MockDate extends RealDate {
      constructor(...args) {
        super(...(args.length ? args : [fixedDate.getTime()]));
      }
      static now() {
        return fixedDate.getTime();
      }
    }
    window.Date = MockDate;
  }, hour);
}

const desktop = await browser.newPage({ viewport: { width: 1280, height: 980 } });
const errors = [];
desktop.on("console", (msg) => {
  if (msg.type() === "error") errors.push(msg.text());
});
await mockLocalHour(desktop, 13);
await seed(desktop);
await desktop.goto(appUrl, { waitUntil: "networkidle" });
await desktop.getByRole("button", { name: "填个例子", exact: true }).click();
const desktopRecordText = await desktop.locator("body").innerText();
const sampleText = await desktop.locator("textarea").first().inputValue();
const desktopTodayText = await clickTab(desktop, "今日");
await desktop.screenshot({ path: "verification-today.png", fullPage: true });
const desktopObserveText = await clickTab(desktop, "观察");
await desktop.screenshot({ path: "verification-observe.png", fullPage: true });
await desktop.getByRole("button", { name: "本月", exact: true }).click();
await desktop.waitForTimeout(180);
const monthTrendTitles = await desktop.locator('button[title*="kcal"]').evaluateAll((buttons) =>
  buttons.map((button) => button.getAttribute("title") || "")
);
const expectedMonthDays = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate();
await desktop.screenshot({ path: "verification-month.png", fullPage: true });
await desktop.getByRole("button", { name: "本周", exact: true }).click();
await desktop.waitForTimeout(120);
await clickTab(desktop, "下一餐");
await desktop.getByText("智能建议暂时不可用，先看看备选方案").waitFor();
const desktopNextText = await desktop.locator("body").innerText();
await desktop.getByRole("button", { name: "到店吃", exact: true }).click();
await desktop.getByText("到店这样选更稳").waitFor();
const dineInText = await desktop.locator("body").innerText();
await desktop.getByRole("button", { name: "自己做", exact: true }).click();
await desktop.getByText("家常菜三选一").waitFor();
const homeCookText = await desktop.locator("body").innerText();
await desktop.getByRole("button", { name: "点外卖", exact: true }).click();
await desktop.getByText("外卖这样点更均衡").waitFor();
const takeawayText = await desktop.locator("body").innerText();
await desktop.getByRole("button", { name: "重试", exact: true }).click();
await desktop.waitForTimeout(850);
const takeawayAfterRetryText = await desktop.locator("body").innerText();
await desktop.screenshot({ path: "verification-next.png", fullPage: true });
const desktopProfileText = await clickTab(desktop, "我的");
await desktop.screenshot({ path: "verification-profile.png", fullPage: true });
await clickTab(desktop, "我的记录");
await desktop.screenshot({ path: "verification-desktop.png", fullPage: true });

const mobile = await browser.newPage({ viewport: { width: 390, height: 900 }, isMobile: true });
const mobileErrors = [];
mobile.on("console", (msg) => {
  if (msg.type() === "error") mobileErrors.push(msg.text());
});
await seed(mobile);
await mobile.goto(appUrl, { waitUntil: "networkidle" });
await mobile.screenshot({ path: "verification-mobile-home.png", fullPage: true });
const mobileRecordText = await mobile.locator("body").innerText();
const mobileTodayText = await clickTab(mobile, "今日");
await mobile.screenshot({ path: "verification-mobile-today.png", fullPage: true });
const mobileObserveText = await clickTab(mobile, "观察");
await mobile.screenshot({ path: "verification-mobile-observe.png", fullPage: true });
await clickTab(mobile, "下一餐");
await mobile.getByText("智能建议暂时不可用，先看看备选方案").waitFor();
await mobile.waitForTimeout(800);
const mobileMenuCount = await mobile.locator('[aria-label="最终选定的三个餐饮方向"] article').count();
await mobile.screenshot({ path: "verification-mobile-next.png", fullPage: true });
const mobileProfileText = await clickTab(mobile, "我的");
await mobile.screenshot({ path: "verification-mobile-profile.png", fullPage: true });
await clickTab(mobile, "我的记录");
await mobile.screenshot({ path: "verification-mobile.png", fullPage: true });

const onboarding = await browser.newPage({ viewport: { width: 390, height: 900 }, isMobile: true });
await onboarding.goto(appUrl, { waitUntil: "networkidle" });
const onboardingBefore = await onboarding.locator("body").innerText();
await onboarding.screenshot({ path: "verification-onboarding.png", fullPage: false });
await onboarding.getByRole("button", { name: "去“我的”填写" }).click();
const onboardingAfter = await onboarding.locator("body").innerText();
const onboardingReturned = await clickTab(onboarding, "我的记录");

const returningProfile = await browser.newPage({ viewport: { width: 390, height: 900 }, isMobile: true });
await returningProfile.addInitScript((profile) => {
  window.localStorage.setItem("chileme-profile", JSON.stringify(profile));
}, seededProfile);
await returningProfile.goto(appUrl, { waitUntil: "networkidle" });
const returningProfileText = await returningProfile.locator("body").innerText();

const aiLoading = await browser.newPage({ viewport: { width: 1280, height: 980 } });
await aiLoading.emulateMedia({ reducedMotion: "reduce" });
const aiCoachRequests = [];
await aiLoading.route("**/api/coach", async (route) => {
  aiCoachRequests.push(route.request().postDataJSON());
  await new Promise((resolve) => setTimeout(resolve, 650));
  await route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      result: {
        title: "外卖这样点更合适",
        tip: "结合今天的记录，优先补充蛋白质和蔬菜。",
        menus: [
          { category: "西式快餐", name: "烤鸡腿堡", detail: "搭配玉米杯和无糖饮料" },
          { category: "中式快餐", name: "蒸鸡套餐", detail: "米饭小份，再加一份时蔬" },
          { category: "牛肉饭", name: "牛肉蔬菜饭", detail: "蔬菜加量，不搭配甜饮" }
        ]
      }
    })
  });
});
await aiLoading.addInitScript(
  ({ records, profile }) => {
    window.localStorage.setItem("chileme-records", JSON.stringify(records));
    window.localStorage.setItem("chileme-profile", JSON.stringify(profile));
    window.localStorage.setItem("chileme-onboarding-seen", "true");
  },
  { records: seededRecords, profile: seededProfile }
);
await aiLoading.goto(appUrl, { waitUntil: "networkidle" });
await aiLoading.getByRole("navigation", { name: "应用板块" }).getByRole("button", { name: "下一餐", exact: true }).click({ force: true });
await aiLoading.waitForTimeout(100);
const aiLoadingText = await aiLoading.locator("body").innerText();
await aiLoading.screenshot({ path: "verification-next-loading.png", fullPage: true });
await aiLoading.waitForTimeout(700);
const aiResultText = await aiLoading.locator("body").innerText();
const aiFinalMenuCount = await aiLoading.locator('[aria-label="最终选定的三个餐饮方向"] article').count();
const manualRailControls = await aiLoading.getByRole("button", { name: /查看上一个餐饮方向|查看下一个餐饮方向/ }).count();
await aiLoading.getByRole("button", { name: "健身补充", exact: true }).click();
await aiLoading.waitForTimeout(750);
const fitnessIntentRequest = aiCoachRequests.at(-1);

const breakfastMissing = await browser.newPage({ viewport: { width: 1280, height: 980 } });
await mockLocalHour(breakfastMissing, 9);
await seed(breakfastMissing);
await breakfastMissing.goto(appUrl, { waitUntil: "networkidle" });
await clickTab(breakfastMissing, "下一餐");
await breakfastMissing.getByText("外卖早餐这样点").waitFor();
const breakfastMissingText = await breakfastMissing.locator("body").innerText();

const breakfastRecorded = await browser.newPage({ viewport: { width: 1280, height: 980 } });
await mockLocalHour(breakfastRecorded, 9);
await breakfastRecorded.route("**/api/coach", async (route) => {
  await route.fulfill({
    status: 503,
    contentType: "application/json",
    body: JSON.stringify({ error: "verification fallback" })
  });
});
await breakfastRecorded.addInitScript(
  ({ records, profile }) => {
    window.localStorage.setItem("chileme-records", JSON.stringify(records));
    window.localStorage.setItem("chileme-profile", JSON.stringify(profile));
    window.localStorage.setItem("chileme-onboarding-seen", "true");
  },
  {
    records: [
      {
        id: "verify-breakfast",
        slot: "早餐",
        foods: ["鸡蛋", "牛奶"],
        calories: 320,
        protein: 20,
        carbs: 28,
        fat: 12,
        vegetableRatio: 0,
        verdict: "早餐包含蛋白质和主食。",
        createdAt: new Date().toISOString()
      }
    ],
    profile: seededProfile
  }
);
await breakfastRecorded.goto(appUrl, { waitUntil: "networkidle" });
await clickTab(breakfastRecorded, "下一餐");
await breakfastRecorded.getByText("外卖这样点更均衡").waitFor();
const breakfastRecordedText = await breakfastRecorded.locator("body").innerText();

const portionPage = await browser.newPage({ viewport: { width: 1280, height: 980 } });
const portionRequests = [];
await portionPage.route("**/api/estimate", async (route) => {
  const body = route.request().postDataJSON();
  portionRequests.push(body);
  await route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      result: {
        foods: ["蛋炒饭"],
        calories: body.portion ? 640 : 620,
        protein: 18,
        carbs: 92,
        fat: 20,
        vegetableRatio: 8,
        verdict: body.portion ? "已按确认份量重新估算。" : "请确认实际进食份量。"
      }
    })
  });
});
await portionPage.addInitScript((profile) => {
  window.localStorage.setItem("chileme-profile", JSON.stringify(profile));
  window.localStorage.setItem("chileme-onboarding-seen", "true");
  window.localStorage.removeItem("chileme-records");
}, seededProfile);
await portionPage.goto(appUrl, { waitUntil: "networkidle" });
await portionPage.locator("textarea").first().fill("午餐吃了一盘蛋炒饭");
await portionPage.getByRole("button", { name: "整理成记录", exact: true }).click();
await portionPage.getByText("这餐大概吃了多少？").waitFor();
const createDisabledBeforePortion = await portionPage.getByRole("button", { name: "先确认份量", exact: true }).isDisabled();
await portionPage.getByRole("button", { name: /正常/ }).click();
await portionPage.getByText("份量已确认").waitFor();
const createEnabledAfterPortion = await portionPage.getByRole("button", { name: "生成饮食记录", exact: true }).isEnabled();
await portionPage.waitForTimeout(150);
await portionPage.screenshot({ path: "verification-portion.png", fullPage: true });

const cachePage = await browser.newPage({ viewport: { width: 1280, height: 980 } });
const coachRequests = [];
await cachePage.route("**/api/coach", async (route) => {
  const body = route.request().postDataJSON();
  coachRequests.push(body);
  const batch = coachRequests.length;
  await route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      result: {
        title: `缓存第${batch === 1 ? "一" : "二"}批`,
        tip: "结合今天的记录生成。",
        menus: [
          { category: "中式快餐", name: batch === 1 ? "蒸鸡套餐" : "鸡汤套餐", detail: "搭配一份时蔬" },
          { category: "牛肉饭", name: batch === 1 ? "牛肉蔬菜饭" : "鸡肉饭", detail: "米饭小份" },
          { category: "面馆", name: batch === 1 ? "牛肉面" : "鸡丝面", detail: "搭配一份青菜" }
        ]
      }
    })
  });
});
await cachePage.goto(appUrl, { waitUntil: "networkidle" });
await cachePage.evaluate(
  ({ records, profile }) => {
    window.localStorage.setItem("chileme-records", JSON.stringify(records));
    window.localStorage.setItem("chileme-profile", JSON.stringify(profile));
    window.localStorage.setItem("chileme-onboarding-seen", "true");
    window.localStorage.removeItem("chileme-next-meal-cache-v3");
    window.localStorage.removeItem("chileme-recommendation-history-v2");
  },
  { records: seededRecords, profile: seededProfile }
);
await cachePage.reload({ waitUntil: "networkidle" });
await clickTab(cachePage, "下一餐");
await cachePage.getByText("缓存第一批").waitFor();
await cachePage.waitForTimeout(150);
await cachePage.reload({ waitUntil: "networkidle" });
await cachePage.waitForTimeout(150);
await clickTab(cachePage, "下一餐");
await cachePage.getByText("已保留上次生成的搭配").waitFor();
const requestsAfterCacheHit = coachRequests.length;
await cachePage.getByRole("button", { name: "换一批", exact: true }).click();
await cachePage.getByText("缓存第二批").waitFor();
const refreshedCoachRequest = coachRequests[1];
await cachePage.screenshot({ path: "verification-cache-refresh.png", fullPage: true });

const restrictionPage = await browser.newPage({ viewport: { width: 1280, height: 980 } });
await restrictionPage.route("**/api/coach", async (route) => {
  await route.fulfill({
    status: 503,
    contentType: "application/json",
    body: JSON.stringify({ error: "verification fallback" })
  });
});
await restrictionPage.addInitScript(
  ({ records, profile }) => {
    window.localStorage.setItem("chileme-records", JSON.stringify(records));
    window.localStorage.setItem("chileme-profile", JSON.stringify(profile));
    window.localStorage.setItem("chileme-onboarding-seen", "true");
    window.localStorage.removeItem("chileme-next-meal-cache-v3");
    window.localStorage.removeItem("chileme-recommendation-history-v2");
  },
  { records: seededRecords, profile: restrictedProfile }
);
await restrictionPage.goto(appUrl, { waitUntil: "networkidle" });
await clickTab(restrictionPage, "下一餐");
await restrictionPage.getByText("先按过敏信息筛选").waitFor();
const restrictionFallbackText = await restrictionPage.locator("body").innerText();

await browser.close();

const rateLimitIp = `verify-${Date.now()}`;
let rateLimitStatus = 0;
for (let index = 0; index < 25; index += 1) {
  const response = await fetch(`${appUrl}/api/coach`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-forwarded-for": rateLimitIp
    },
    body: JSON.stringify({})
  });
  rateLimitStatus = response.status;
}

const result = {
  desktop: {
    hasContent: desktopRecordText.includes("吃了么"),
    hasRecordAgent: desktopRecordText.includes("记下这一餐") && desktopRecordText.includes("拍下这一餐"),
    hasSnack: desktopTodayText.includes("加餐") && desktopTodayText.includes("酸奶"),
    hasAnalysis: desktopTodayText.includes("营养概览") && desktopTodayText.includes("当前浏览器"),
    hasCalorieReference: desktopTodayText.includes("每日参考区间") && desktopTodayText.includes("1780–2100 kcal"),
    hasCalendar:
      desktopObserveText.includes("热量趋势") &&
      desktopObserveText.includes("这段时间的观察") &&
      desktopObserveText.includes("近期开吃频率") &&
      desktopObserveText.includes("2 次"),
    hasNextMeal:
      desktopNextText.includes("下一餐方向") &&
      takeawayText.includes("外卖这样点更均衡"),
    switchesMealScene:
      dineInText.includes("到店这样选更稳") &&
      homeCookText.includes("家常菜三选一") &&
      takeawayText.includes("外卖这样点更均衡"),
    rotatesFallback: takeawayAfterRetryText !== takeawayText,
    hasNutritionGap:
      desktopNextText.includes("根据今天的记录") &&
      desktopNextText.includes("蛋白质仍偏少") &&
      desktopNextText.includes("绿叶菜与菌菇"),
    genericDirectionsOnly:
      ["老乡鸡", "真功夫", "麦当劳", "肯德基", "吉野家", "海底捞"].every((name) =>
        !`${takeawayAfterRetryText}${aiResultText}`.includes(name)
      ),
    hasProfile: desktopProfileText.includes("编辑档案") && desktopProfileText.includes("170cm"),
    sampleFilled: sampleText.includes("午餐吃了蛋炒饭一盘"),
    errors
  },
  mobile: {
    hasContent: mobileRecordText.includes("吃了么"),
    hasUpload: mobileRecordText.includes("拍下这一餐") || mobileRecordText.includes("记下这一餐"),
    hasToday: mobileTodayText.includes("今日餐单") && mobileTodayText.includes("当前浏览器"),
    hasCalendar: mobileObserveText.includes("热量趋势") && mobileObserveText.includes("这段时间的观察"),
    showsThreeFinalMenus: mobileMenuCount === 3,
    hasProfile: mobileProfileText.includes("编辑档案") && mobileProfileText.includes("170cm"),
    errors: mobileErrors
  },
  onboarding: {
    hasGuide: onboardingBefore.includes("先完善个人档案") && onboardingBefore.includes("饮食建议更适合你"),
    opensProfile: onboardingAfter.includes("完善个人档案") && onboardingAfter.includes("保存个人档案"),
    staysDismissed: !onboardingReturned.includes("第一次使用"),
    existingProfileSkips: !returningProfileText.includes("第一次使用")
  },
  aiRecommendation: {
    hidesFallbackWhileLoading:
      aiLoadingText.includes("正在生成") &&
      aiLoadingText.includes("本餐目标") &&
      !aiLoadingText.includes("备用方案"),
    usesMealIntent: fitnessIntentRequest?.data?.mealIntent === "健身补充",
    showsResultAfterResponse:
      aiResultText.includes("西式快餐") &&
      aiResultText.includes("烤鸡腿堡") &&
      !aiResultText.includes("备用方案") &&
      aiFinalMenuCount === 3 &&
      manualRailControls === 0
  },
  monthCalendar: {
    showsEveryDay:
      monthTrendTitles.length === expectedMonthDays &&
      monthTrendTitles[0]?.includes("-01：") &&
      monthTrendTitles.at(-1)?.includes(`-${String(expectedMonthDays).padStart(2, "0")}：`)
  },
  mealTiming: {
    breakfastWhenMissingBeforeEleven:
      breakfastMissingText.includes("本次推荐：早餐") &&
      breakfastMissingText.includes("外卖早餐这样点"),
    lunchAfterBreakfast:
      breakfastRecordedText.includes("本次推荐：午餐") &&
      !breakfastRecordedText.includes("外卖早餐这样点")
  },
  portionConfirmation: {
    blocksUnconfirmedRecord: createDisabledBeforePortion,
    reestimatesWithAi:
      createEnabledAfterPortion &&
      portionRequests.length === 2 &&
      portionRequests[1].portion === "regular" &&
      Boolean(portionRequests[1].baseEstimate)
  },
  recommendationCache: {
    reusesSavedResult: requestsAfterCacheHit === 1,
    refreshesOnDemand:
      coachRequests.length === 2 &&
      refreshedCoachRequest?.data?.avoidMenus?.includes("中式快餐蒸鸡套餐") &&
      refreshedCoachRequest?.data?.recentRecommendations?.includes("中式快餐·蒸鸡套餐"),
    usesFoodFrequency:
      coachRequests[0]?.data?.recentFoodFrequency?.some((item) => item.food === "蛋炒饭" && item.count === 2)
  },
  restrictions: {
    safeFallback:
      restrictionFallbackText.includes("先按过敏信息筛选") &&
      !restrictionFallbackText.includes("中式快餐")
  },
  rateLimit: {
    blocksBurst: rateLimitStatus === 429
  }
};

console.log(JSON.stringify(result, null, 2));

if (
  !result.desktop.hasContent ||
  !result.desktop.hasRecordAgent ||
  !result.desktop.hasSnack ||
  !result.desktop.hasAnalysis ||
  !result.desktop.hasCalorieReference ||
  !result.desktop.hasNextMeal ||
  !result.desktop.switchesMealScene ||
  !result.desktop.rotatesFallback ||
  !result.desktop.hasNutritionGap ||
  !result.desktop.genericDirectionsOnly ||
  !result.desktop.hasProfile ||
  !result.desktop.hasCalendar ||
  !result.desktop.sampleFilled ||
  result.desktop.errors.length ||
  !result.mobile.hasContent ||
  !result.mobile.hasUpload ||
  !result.mobile.hasToday ||
  !result.mobile.hasCalendar ||
  !result.mobile.showsThreeFinalMenus ||
  !result.mobile.hasProfile ||
  !result.onboarding.hasGuide ||
  !result.onboarding.opensProfile ||
  !result.onboarding.staysDismissed ||
  !result.onboarding.existingProfileSkips ||
  !result.aiRecommendation.hidesFallbackWhileLoading ||
  !result.aiRecommendation.usesMealIntent ||
  !result.aiRecommendation.showsResultAfterResponse ||
  !result.monthCalendar.showsEveryDay ||
  !result.mealTiming.breakfastWhenMissingBeforeEleven ||
  !result.mealTiming.lunchAfterBreakfast ||
  !result.portionConfirmation.blocksUnconfirmedRecord ||
  !result.portionConfirmation.reestimatesWithAi ||
  !result.recommendationCache.reusesSavedResult ||
  !result.recommendationCache.refreshesOnDemand ||
  !result.recommendationCache.usesFoodFrequency ||
  !result.restrictions.safeFallback ||
  !result.rateLimit.blocksBurst ||
  result.mobile.errors.length
) {
  process.exit(1);
}
