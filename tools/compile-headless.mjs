import puppeteer from "puppeteer-core";

const chrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const url = process.env.COMPILE_URL || "http://localhost:4173/compile.html?auto=1";

const browser = await puppeteer.launch({
  executablePath: chrome,
  headless: "new",
  args: [
    "--hide-scrollbars",
    "--ignore-gpu-blocklist",
    "--enable-webgl",
    "--use-gl=angle",
    "--no-sandbox",
  ],
});

const page = await browser.newPage();
page.on("console", (msg) => console.log("browser:", msg.type(), msg.text()));
page.on("pageerror", (err) => console.log("pageerror:", err.message));
page.setDefaultTimeout(300000);

console.log("open", url);
await page.goto(url, { waitUntil: "domcontentloaded" });

await page.waitForFunction(
  () => document.getElementById("log")?.textContent.includes("done")
    || document.getElementById("status")?.textContent.includes("失敗"),
  { timeout: 300000 }
);

const status = await page.$eval("#status", (el) => el.textContent);
const log = await page.$eval("#log", (el) => el.textContent);
console.log(status);
console.log(log);
await browser.close();
if (!log.includes("done")) process.exit(1);
