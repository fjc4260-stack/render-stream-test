import express from "express";
import { chromium } from "playwright";

const app = express();
const PORT = Number(process.env.PORT || 10000);
const STREAM_URL = process.env.STREAM_URL || "";
const CLIENTS = Math.max(1, Math.min(Number(process.env.CLIENTS || 5), 10));
const RUN_ON_START = String(process.env.RUN_ON_START || "true").toLowerCase() === "true";
const HEADLESS = String(process.env.HEADLESS || "true").toLowerCase() !== "false";

let browser;
const clients = new Map();

app.get("/health", (_req, res) => {
  res.status(200).json({
    ok: true,
    configured: Boolean(STREAM_URL),
    clients: clients.size,
    target: STREAM_URL || null
  });
});

app.get("/status", (_req, res) => {
  res.json({
    target: STREAM_URL || null,
    clients: [...clients.values()].map(c => ({
      id: c.id,
      state: c.state,
      url: c.url,
      title: c.title,
      error: c.error || null
    }))
  });
});

const PROFILES = [
  { ua: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36", width: 1366, height: 768, locale: "fa-IR", tz: "Asia/Tehran" },
  { ua: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36", width: 1536, height: 864, locale: "en-US", tz: "Europe/Amsterdam" },
  { ua: "Mozilla/5.0 (Macintosh; Intel Mac OS X 13_6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36", width: 1440, height: 900, locale: "en-US", tz: "America/New_York" },
  { ua: "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:142.0) Gecko/20100101 Firefox/142.0", width: 1920, height: 1080, locale: "de-DE", tz: "Europe/Berlin" },
  { ua: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36", width: 1280, height: 800, locale: "tr-TR", tz: "Europe/Istanbul" }
];

async function startClient(id) {
  if (!STREAM_URL) throw new Error("STREAM_URL is not configured");

  const profile = PROFILES[(id - 1) % PROFILES.length];

  const context = await browser.newContext({
    storageState: { cookies: [], origins: [] },
    viewport: { width: profile.width, height: profile.height },
    locale: profile.locale,
    timezoneId: profile.tz,
    userAgent: profile.ua,
    colorScheme: id % 2 ? "light" : "dark",
    javaScriptEnabled: true
  });

  const page = await context.newPage();

  const record = {
    id,
    state: "starting",
    url: STREAM_URL,
    title: "",
    error: "",
    profile: {
      userAgent: profile.ua,
      viewport: `${profile.width}x${profile.height}`,
      locale: profile.locale,
      timezone: profile.tz,
      colorScheme: id % 2 ? "light" : "dark"
    },
    observed: {}
  };
  clients.set(id, record);

  page.on("console", msg => {
    if (msg.type() === "error") console.log(`[client-${id}] console: ${msg.text()}`);
  });
  page.on("pageerror", err => console.log(`[client-${id}] pageerror: ${err.message}`));

  try {
    await page.goto(STREAM_URL, {
      waitUntil: "domcontentloaded",
      timeout: 60000
    });

    record.state = "loaded";
    record.title = await page.title().catch(() => "");

    // Collect observable browser properties for TESTING/diagnostics only.
    record.observed = await page.evaluate(() => ({
      language: navigator.language,
      languages: navigator.languages,
      platform: navigator.platform,
      hardwareConcurrency: navigator.hardwareConcurrency,
      deviceMemory: navigator.deviceMemory ?? null,
      maxTouchPoints: navigator.maxTouchPoints,
      screen: `${screen.width}x${screen.height}`,
      colorDepth: screen.colorDepth,
      pixelRatio: devicePixelRatio,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      cookieEnabled: navigator.cookieEnabled,
      webdriver: navigator.webdriver
    }));

    // Generic consent handling only; no CAPTCHA/anti-bot bypass.
    const consentTexts = [
      "تایید", "تأیید", "موافقم", "قبول", "ادامه",
      "Accept", "Agree", "Continue", "I agree"
    ];

    for (const text of consentTexts) {
      const button = page.getByRole("button", { name: text, exact: false }).first();
      if (await button.count()) {
        try {
          await button.click({ timeout: 2500 });
          record.state = "consent-clicked";
          break;
        } catch {}
      }
    }

    await new Promise(() => {});
  } catch (err) {
    record.state = "error";
    record.error = String(err?.message || err);
  }
}

async function startAll() {
  if (!STREAM_URL) {
    console.log("STREAM_URL is empty; set it in Render Environment.");
    return;
  }

  browser = await chromium.launch({
    headless: HEADLESS,
    args: [
      "--no-sandbox",
      "--disable-dev-shm-usage"
    ]
  });

  for (let i = 1; i <= CLIENTS; i++) {
    startClient(i).catch(err => console.error(`[client-${i}]`, err));
    await new Promise(r => setTimeout(r, 1000));
  }
}

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Listening on 0.0.0.0:${PORT}`);
  if (RUN_ON_START) startAll().catch(err => console.error("startup:", err));
});

async function shutdown() {
  try { await browser?.close(); } catch {}
  process.exit(0);
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
