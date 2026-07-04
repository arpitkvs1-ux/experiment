import { chromium } from "playwright";

const browser = await chromium.launch();
const page = await browser.newPage();
page.on("console", (m) => console.log("CONSOLE", m.type(), m.text()));
page.on("pageerror", (e) => console.log("PAGEERROR", e.message));
page.on("requestfailed", (r) => console.log("REQFAIL", r.url(), r.failure()?.errorText));
page.on("response", (r) => {
  if (String(r.url()).includes("script.google.com")) {
    console.log("GAS", r.status(), r.url().slice(0, 80));
  }
});

await page.goto("http://localhost:3000/", { waitUntil: "networkidle", timeout: 60000 });
await page.waitForTimeout(12000);

const count = await page.textContent("#homeRecordCount");
const evalResult = await page.evaluate(() => {
  const keys = [];
  for (let i = 0; i < localStorage.length; i++) keys.push(localStorage.key(i));
  let studentLen = 0;
  for (const k of keys) {
    if (k.includes("kv_studentapp_v1")) {
      try {
        studentLen = JSON.parse(localStorage.getItem(k)).length;
      } catch (_e) {}
    }
  }
  return {
    keys,
    studentLen,
    url: window.KV_SHEETS_WEB_APP_URL,
    hasKVSheets: !!window.KVSheets,
  };
});

console.log("homeRecordCount=", count);
console.log("eval=", JSON.stringify(evalResult, null, 2));
await browser.close();
