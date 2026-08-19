import {
  GROUPS,
  $,
  setOverlayState,
  setCopy,
  writeHandoff,
  captureFreezeFrame,
  applyFreezeBackground,
  stopAR,
  resolveMindUrl,
  mountImageScene,
  waitEvent,
  prefersMock,
  GoldDust,
} from "./shared.js";

const group = GROUPS[0];
const overlay = $("#overlay");
const progressBar = $("#progress-bar");
const dust = GoldDust($("#dust"));
dust.start();

const LOCK_MS = 400;

let locked = false;
let lockTimer = 0;
let driftTimer = 0;

function setProgress(p) {
  progressBar.style.width = `${Math.max(2, Math.min(100, p))}%`;
}

function goScanning() {
  setOverlayState("scanning");
  setCopy("ロゴをかざしてください", "カード右下の CyberAgent legit を枠に入れてください");
  driftTimer = window.setInterval(() => dust.drift(), 420);
}

async function playPortalAndGo() {
  clearInterval(driftTimer);
  dust.burst();
  setOverlayState("found");
  setCopy("認識しました", "CyberAgent legit へ接続しています");

  await new Promise((r) => setTimeout(r, 720));

  const freeze = captureFreezeFrame();
  applyFreezeBackground(freeze);
  writeHandoff({
    groupId: group.id,
    freezeFrame: freeze,
  });

  setOverlayState("portal");
  setCopy("人物スキャンへ", "カメラをカードの人物へ向けてください");

  const prefetch = document.createElement("link");
  prefetch.rel = "prefetch";
  prefetch.href = group.url;
  document.head.appendChild(prefetch);

  await new Promise((r) => setTimeout(r, 980));
  await stopAR();
  await new Promise((r) => setTimeout(r, 180));
  const dest = new URL(group.url, location.href);
  if (prefersMock()) dest.searchParams.set("mock", "1");
  location.assign(dest.href);
}

function bindTarget(sceneEl) {
  const target = sceneEl.querySelector("[mindar-image-target]");

  target.addEventListener("targetFound", () => {
    if (locked) return;
    setOverlayState("recognized");
    setCopy("認識しました", "CyberAgent legit");
    dust.burst();
    window.clearTimeout(lockTimer);
    lockTimer = window.setTimeout(() => {
      if (locked) return;
      locked = true;
      playPortalAndGo();
    }, LOCK_MS);
  });

  target.addEventListener("targetLost", () => {
    if (locked) return;
    window.clearTimeout(lockTimer);
    lockTimer = 0;
    setOverlayState("scanning");
    setCopy("ロゴをかざしてください", "カード右下の CyberAgent legit を枠に入れてください");
  });
}

async function startAR() {
  locked = false;
  window.clearTimeout(lockTimer);
  setOverlayState("prepare");
  setCopy("マーカーを準備しています", "初回のみ数秒かかることがあります");
  setProgress(6);

  try {
    const mindUrl = await resolveMindUrl(
      "logo",
      group.logoMind,
      group.logoImage,
      (p) => setProgress(p)
    );
    setProgress(100);

    const sceneEl = mountImageScene({
      container: $("#ar-root"),
      mindUrl,
      targetHTML: `
        <a-entity mindar-image-target="targetIndex: 0">
          <a-ring
            color="#d4af37"
            radius-inner="0.46"
            radius-outer="0.51"
            opacity="0.85"
            animation="property: rotation; to: 0 0 360; dur: 6000; easing: linear; loop: true"
          ></a-ring>
        </a-entity>
      `,
    });

    sceneEl.addEventListener("arError", () => {
      setOverlayState("error");
      setCopy("カメラを起動できませんでした", "HTTPS（または localhost）とカメラ許可を確認してください");
    });

    await Promise.race([
      waitEvent(sceneEl, "arReady"),
      new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 20000)),
    ]);

    goScanning();
    bindTarget(sceneEl);
  } catch (err) {
    console.error(err);
    setOverlayState("error");
    setCopy("準備に失敗しました", err.message || "compile.html で .mind を生成してください");
  }
}

function startMock() {
  goScanning();
  window.setTimeout(() => {
    if (locked) return;
    setOverlayState("recognized");
    setCopy("認識しました", "CyberAgent legit");
    dust.burst();
    window.setTimeout(() => {
      if (locked) return;
      locked = true;
      playPortalAndGo();
    }, LOCK_MS);
  }, 1800);
}

$("#start-btn").addEventListener("click", () => {
  if (prefersMock()) startMock();
  else startAR();
});

$("#mock-btn").addEventListener("click", () => {
  const url = new URL(location.href);
  url.searchParams.set("mock", "1");
  history.replaceState(null, "", url);
  startMock();
});

if (prefersMock()) {
  setCopy("デモ準備完了", "カメラなしで遷移演出を確認できます");
}
