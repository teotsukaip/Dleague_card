/**
 * D.LEAGUE card AR — shared helpers
 *
 * 600枚を1URLで追うのはモバイルのメモリと認識精度の限界を超える。
 * ロゴ(~20)でグループを特定し、グループURL(~30人)へ渡す。
 */
export const GROUPS = [
  {
    id: "legit",
    name: "CyberAgent legit",
    url: "./group.html?g=legit",
    logoMind: "./assets/logo.mind",
    logoImage: "./assets/markers/logo.png",
    peopleMind: "./assets/hito.mind",
    peopleImage: "./assets/markers/hito.png",
    players: [
      {
        id: "takumi",
        name: "TAKUMI",
        label: "TAKUMIです",
        nameplate: "./assets/nameplate.png",
        aspect: 720 / 704,
      },
    ],
  },
];

export const HANDOFF_KEY = "dleague-handoff";
const MIND_DB = "dleague-mind-cache";
const MIND_STORE = "files";

export function getGroup(id) {
  return GROUPS.find((g) => g.id === id) || GROUPS[0];
}

export function $(sel, root = document) {
  return root.querySelector(sel);
}

export function setOverlayState(state) {
  const overlay = $("#overlay");
  if (!overlay) return;
  overlay.dataset.state = state;
  overlay.setAttribute("data-state", state);
}

export function setCopy(title, sub) {
  const t = $("#overlay-title");
  const s = $("#overlay-sub");
  if (t) t.textContent = title;
  if (s) s.textContent = sub;
}

export function readHandoff() {
  try {
    const raw = sessionStorage.getItem(HANDOFF_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (Date.now() - data.ts > 12000) return null;
    return data;
  } catch {
    return null;
  }
}

export function writeHandoff(payload) {
  sessionStorage.setItem(
    HANDOFF_KEY,
    JSON.stringify({ ...payload, ts: Date.now() })
  );
}

export function clearHandoff() {
  sessionStorage.removeItem(HANDOFF_KEY);
}

export function captureFreezeFrame() {
  const video = document.querySelector("video");
  if (!video || !video.videoWidth) return null;
  const canvas = document.createElement("canvas");
  const w = 720;
  const h = Math.round((video.videoHeight / video.videoWidth) * w);
  canvas.width = w;
  canvas.height = h;
  canvas.getContext("2d").drawImage(video, 0, 0, w, h);
  return canvas.toDataURL("image/jpeg", 0.55);
}

export function applyFreezeBackground(dataUrl) {
  const freeze = $("#freeze");
  if (!freeze || !dataUrl) return;
  freeze.style.backgroundImage = `url("${dataUrl}")`;
  freeze.classList.add("is-on");
}

export async function stopAR() {
  const sceneEl = document.querySelector("a-scene");
  try {
    const sys = sceneEl?.systems?.["mindar-image-system"];
    if (sys?.stop) await sys.stop();
  } catch {
    /* ignore */
  }
  document.querySelectorAll("video").forEach((video) => {
    video.srcObject?.getTracks?.().forEach((track) => track.stop());
    video.removeAttribute("src");
    video.load?.();
  });
}

function openMindDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(MIND_DB, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(MIND_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGet(key) {
  const db = await openMindDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(MIND_STORE, "readonly");
    const req = tx.objectStore(MIND_STORE).get(key);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

async function idbSet(key, value) {
  const db = await openMindDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(MIND_STORE, "readwrite");
    tx.objectStore(MIND_STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("image load failed: " + src));
    img.src = src;
  });
}

export async function compileMindFromImage(imageSrc, onProgress) {
  if (!window.MINDAR?.IMAGE?.Compiler) {
    throw new Error("MindAR Compiler が読み込まれていません");
  }
  const img = await loadImage(imageSrc);
  const compiler = new window.MINDAR.IMAGE.Compiler();
  await compiler.compileImageTargets([img], (progress) => {
    onProgress?.(progress);
  });
  return compiler.exportData();
}

export async function resolveMindUrl(key, mindPath, imagePath, onProgress) {
  const tryFetch = async (url) => {
    const res = await fetch(url, { cache: "reload" });
    if (!res.ok) return null;
    const buf = await res.arrayBuffer();
    if (buf.byteLength < 64) return null;
    return buf;
  };

  let buffer = await tryFetch(mindPath).catch(() => null);
  if (!buffer) buffer = await idbGet(key);

  if (!buffer) {
    onProgress?.(1);
    buffer = await compileMindFromImage(imagePath, onProgress);
    await idbSet(key, buffer);
    fetch("/api/mind", {
      method: "POST",
      headers: { "Content-Type": "application/octet-stream", "X-Mind-Key": key },
      body: buffer,
    }).catch(() => {});
  }

  return URL.createObjectURL(new Blob([buffer], { type: "application/octet-stream" }));
}

export function mountImageScene({ container, mindUrl, targetHTML }) {
  container.innerHTML = `
    <a-scene
      embedded
      vr-mode-ui="enabled: false"
      device-orientation-permission-ui="enabled: false"
      color-space="sRGB"
      renderer="colorManagement: true; physicallyCorrectLights: true"
      mindar-image="imageTargetSrc: ${mindUrl}; maxTrack: 1; uiScanning: no; uiLoading: no; filterMinCF: 0.0001; filterBeta: 0.001"
    >
      <a-camera position="0 0 0" look-controls="enabled: false"></a-camera>
      ${targetHTML}
    </a-scene>
  `;
  return container.querySelector("a-scene");
}

export function waitEvent(el, name) {
  return new Promise((resolve) => el.addEventListener(name, resolve, { once: true }));
}

export function prefersMock() {
  const q = new URLSearchParams(location.search);
  return q.get("mock") === "1";
}

export function GoldDust(canvas) {
  const ctx = canvas.getContext("2d");
  const particles = [];
  let raf = 0;
  let running = false;

  const resize = () => {
    canvas.width = Math.floor(window.innerWidth * devicePixelRatio);
    canvas.height = Math.floor(window.innerHeight * devicePixelRatio);
    canvas.style.width = "100%";
    canvas.style.height = "100%";
  };

  const spawn = (x, y, n, burst) => {
    for (let i = 0; i < n; i += 1) {
      const a = Math.random() * Math.PI * 2;
      const s = burst ? 1.2 + Math.random() * 3.2 : 0.15 + Math.random() * 0.7;
      particles.push({
        x,
        y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s - (burst ? 0.4 : 0.15),
        life: 1,
        decay: burst ? 0.008 + Math.random() * 0.012 : 0.003 + Math.random() * 0.004,
        size: (burst ? 1.6 : 0.8) + Math.random() * 2.2,
      });
    }
  };

  const tick = () => {
    if (!running) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.globalCompositeOperation = "lighter";
    for (let i = particles.length - 1; i >= 0; i -= 1) {
      const p = particles[i];
      p.x += p.vx * devicePixelRatio;
      p.y += p.vy * devicePixelRatio;
      p.vy += 0.01 * devicePixelRatio;
      p.life -= p.decay;
      if (p.life <= 0) {
        particles.splice(i, 1);
        continue;
      }
      ctx.fillStyle = `rgba(212, 175, 55, ${p.life * 0.9})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * devicePixelRatio, 0, Math.PI * 2);
      ctx.fill();
    }
    raf = requestAnimationFrame(tick);
  };

  return {
    start() {
      resize();
      window.addEventListener("resize", resize);
      running = true;
      tick();
    },
    burst() {
      spawn(canvas.width / 2, canvas.height / 2, 90, true);
    },
    drift() {
      spawn(
        canvas.width * (0.3 + Math.random() * 0.4),
        canvas.height * (0.25 + Math.random() * 0.4),
        4,
        false
      );
    },
    stop() {
      running = false;
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    },
  };
}
