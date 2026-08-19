import {
  $,
  getGroup,
  setOverlayState,
  setCopy,
  readHandoff,
  clearHandoff,
  applyFreezeBackground,
  resolveMindUrl,
  mountImageScene,
  waitEvent,
  prefersMock,
  GoldDust,
} from "./shared.js";

const params = new URLSearchParams(location.search);
const group = getGroup(params.get("g") || "legit");
const player = group.players[0];
const handoff = readHandoff();
const dust = GoldDust($("#dust"));
dust.start();

$("#badge-name").textContent = group.name;

const progressBar = $("#progress-bar");
function setProgress(p) {
  progressBar.style.width = `${Math.max(2, Math.min(100, p))}%`;
}

function goScanning() {
  setOverlayState("scanning");
  setCopy("人物をかざしてください", `${group.name} のカードを枠に入れてください`);
  document.body.classList.remove("is-tracking");
}

function onFound() {
  setOverlayState("scanning");
  setCopy("", "");
  document.body.classList.add("is-tracking");
  $("#hint-chip").textContent = player.label;
  dust.burst();
}

function onLost() {
  document.body.classList.remove("is-tracking");
  setCopy("人物をかざしてください", "カードから外れると表示が消えます");
}

function bindTarget(sceneEl) {
  const target = sceneEl.querySelector("[mindar-image-target]");
  target.addEventListener("targetFound", onFound);
  target.addEventListener("targetLost", onLost);
}

async function startAR() {
  setOverlayState("prepare");
  setCopy("人物マーカーを準備しています", group.name);
  setProgress(8);

  try {
    const mindUrl = await resolveMindUrl(
      "hito",
      group.peopleMind,
      group.peopleImage,
      (p) => setProgress(p)
    );
    setProgress(100);

    const h = 1 / player.aspect;
    const sceneEl = mountImageScene({
      container: $("#ar-root"),
      mindUrl,
      targetHTML: `
        <a-entity mindar-image-target="targetIndex: 0">
          <a-image
            src="${player.nameplate}"
            position="0 ${h * 0.58} 0.04"
            width="1.05"
            height="0.37"
            animation="property: position; to: 0 ${h * 0.64} 0.04; dur: 1600; dir: alternate; loop: true; easing: easeInOutSine"
          ></a-image>
          <a-ring
            color="#d4af37"
            radius-inner="0.48"
            radius-outer="0.525"
            opacity="0.9"
            animation="property: rotation; to: 0 0 360; dur: 9000; easing: linear; loop: true"
          ></a-ring>
        </a-entity>
      `,
    });

    sceneEl.addEventListener("arError", () => {
      setOverlayState("error");
      setCopy("カメラを起動できませんでした", "画面をタップして再試行してください");
    });

    await Promise.race([
      waitEvent(sceneEl, "arReady"),
      new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 20000)),
    ]);

    $("#freeze")?.classList.remove("is-on");
    goScanning();
    bindTarget(sceneEl);
    clearHandoff();
  } catch (err) {
    console.error(err);
    setOverlayState("error");
    setCopy("準備に失敗しました", err.message || "compile.html で .mind を生成してください");
  }
}

function startMock() {
  goScanning();
  setTimeout(() => {
    onFound();
    $("#mock-plate").hidden = false;
  }, 1600);
}

function beginFromHandoff() {
  if (handoff?.freezeFrame) applyFreezeBackground(handoff.freezeFrame);
  setOverlayState("handoff");
  setCopy("人物スキャンへ", "カメラをカードの人物へ向けてください");
  dust.burst();
}

$("#start-btn").addEventListener("click", () => {
  if (prefersMock()) startMock();
  else startAR();
});

$("#retry-btn")?.addEventListener("click", () => startAR());

if (handoff && !prefersMock()) {
  beginFromHandoff();
  // 遷移元でカメラ許可済み。iOS ではジェスチャが切れることがあるので失敗時はタップへ。
  startAR().catch(() => {
    setOverlayState("tap");
    setCopy("続きを表示", "画面をタップすると人物スキャンが始まります");
  });
} else if (handoff && prefersMock()) {
  beginFromHandoff();
  setTimeout(startMock, 700);
}
