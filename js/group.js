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
  stopAR,
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

function showTapToContinue() {
  setOverlayState("tap");
  setCopy("タップして続ける", "カメラの再開には画面を一度タップしてください");
}

let starting = false;

async function startAR({ fromHandoff = false } = {}) {
  if (starting) return;
  starting = true;

  setOverlayState("prepare");
  setCopy("人物マーカーを準備しています", group.name);
  setProgress(8);

  try {
    await stopAR();
    $("#ar-root").innerHTML = "";

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

    const cameraWaitMs = fromHandoff ? 4000 : 20000;
    let cameraTimer = 0;
    try {
      await Promise.race([
        waitEvent(sceneEl, "arReady"),
        waitEvent(sceneEl, "arError").then(() => {
          throw new Error("arError");
        }),
        new Promise((_, reject) => {
          cameraTimer = window.setTimeout(
            () => reject(new Error("camera-timeout")),
            cameraWaitMs
          );
        }),
      ]);
    } finally {
      window.clearTimeout(cameraTimer);
    }

    $("#freeze")?.classList.remove("is-on");
    goScanning();
    bindTarget(sceneEl);
    clearHandoff();
  } catch (err) {
    console.error(err);
    await stopAR();
    if (fromHandoff) {
      showTapToContinue();
      return;
    }
    setOverlayState("error");
    setCopy("準備に失敗しました", "画面をタップして再試行してください");
  } finally {
    starting = false;
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

function beginWithGesture() {
  if (prefersMock()) startMock();
  else startAR({ fromHandoff: false });
}

$("#start-btn").addEventListener("click", beginWithGesture);
$("#retry-btn")?.addEventListener("click", beginWithGesture);
$("#continue-btn")?.addEventListener("click", (event) => {
  event.stopPropagation();
  beginWithGesture();
});
$("#overlay").addEventListener("click", () => {
  if ($("#overlay")?.dataset.state !== "tap") return;
  beginWithGesture();
});

if (handoff && !prefersMock()) {
  beginFromHandoff();
  startAR({ fromHandoff: true });
} else if (handoff && prefersMock()) {
  beginFromHandoff();
  setTimeout(startMock, 700);
}
