import "./style.css";
import { WorldScene } from "./scene/worldScene";
import { renderStartScreen } from "./ui/startScreen";
import { Hud } from "./ui/hud";
import { TouchControls } from "./ui/touchControls";
import { openQuizModal } from "./ui/quizModal";
import { renderEndingScreen } from "./ui/endingCard";
import { AudioManager } from "./audio";
import { loadProgress, saveProgress, clearProgress, loadSettings, saveSettings, saveQuizOverride } from "./storage";
import { loadQuizSet, parseUploadedQuizJson } from "./quizLoader";
import { AVATAR_COLORS, type Progress } from "./types";
import { hexToCss } from "./colorUtil";

const root = document.querySelector<HTMLDivElement>("#app");
if (!root) throw new Error("앱 루트를 찾을 수 없어요.");

const settings = loadSettings();
const audio = new AudioManager(settings.muted);

const ATTACK_COOLDOWN = 0.35;
const ENERGY_REGEN_INTERVAL = 2.5;

function showStartScreen(): void {
  const existing = loadProgress();
  renderStartScreen(root!, {
    hasSave: !!existing,
    savedNickname: existing?.nickname ?? "",
    onStart: (nickname, avatarId) => {
      const progress: Progress = {
        nickname,
        avatarId,
        completedQuizzes: [],
        stompedObstacles: [],
        energy: 0,
        dragonDefeated: false,
      };
      saveProgress(progress);
      startGame(progress);
    },
    onContinue: () => {
      if (existing) startGame(existing);
    },
    onRestart: () => {
      clearProgress();
      showStartScreen();
    },
    getQuizTemplateText: async () => {
      const res = await fetch("/data/quiz.json");
      return res.text();
    },
    onQuizUpload: (text) => {
      parseUploadedQuizJson(text);
      saveQuizOverride(text);
    },
  });
}

async function startGame(progress: Progress): Promise<void> {
  root!.innerHTML = "";

  const quizzes = await loadQuizSet();
  const dragonIndex = quizzes.length;

  const canvas = document.createElement("canvas");
  canvas.className = "game-canvas";
  root!.appendChild(canvas);

  let nearIndex: number | null = null;
  let interactionOpen = false;
  let attackCooldown = 0;
  let energyRegenTimer = 0;

  const input = { up: false, down: false, left: false, right: false, jump: false };

  function currentAvatarColor(): number {
    return AVATAR_COLORS[progress.avatarId] ?? AVATAR_COLORS[0];
  }

  function forestStatusText(): string {
    return `빌런 처치 ${progress.completedQuizzes.length} / ${quizzes.length}`;
  }

  function syncEnergyHud(): void {
    hud.setEnergy(progress.energy);
  }

  const hud = new Hud(root!, {
    onInteract: () => tryInteract(),
    onMuteToggle: () => {
      settings.muted = !settings.muted;
      saveSettings(settings);
      audio.setMuted(settings.muted);
      hud.setMuted(settings.muted);
    },
    onRestart: () => {
      clearProgress();
      window.location.reload();
    },
  });
  hud.setMuted(settings.muted);
  hud.setRegionName("기억의 숲");

  new TouchControls(root!, input);
  hud.setStatus(forestStatusText());
  syncEnergyHud();

  const scene = new WorldScene(canvas, currentAvatarColor(), quizzes.length, {
    onNearChange: (index) => {
      nearIndex = index;
      hud.setInteractVisible(index !== null && !interactionOpen);
      if (index === dragonIndex) {
        hud.setInteractLabel("⚔️ 공격하기");
        const { hp, max } = scene.getDragonHp();
        if (!progress.dragonDefeated) {
          hud.showDragonHp(hp, max);
          hud.setStatus("🐉 드래곤과 전투 중! 에너지로 공격하세요!");
        }
      } else {
        hud.setInteractLabel("E 탐색하기");
        hud.hideDragonHp();
        if (!progress.dragonDefeated) hud.setStatus(forestStatusText());
      }
    },
    onObstacleStomped: (id) => {
      if (!progress.stompedObstacles.includes(id)) {
        progress.stompedObstacles.push(id);
        progress.energy += 1;
        saveProgress(progress);
        syncEnergyHud();
        audio.playCorrect();
      }
    },
    onObstacleHit: () => {
      progress.energy = Math.max(0, progress.energy - 1);
      saveProgress(progress);
      syncEnergyHud();
      audio.playWrong();
    },
  });

  // Replay saved progress onto the freshly built world.
  quizzes.forEach((q, i) => {
    if (progress.completedQuizzes.includes(q.id)) scene.markStationSolved(i);
  });
  progress.stompedObstacles.forEach((id) => scene.markObstacleStomped(id));
  if (progress.dragonDefeated) scene.instantlyDefeatDragon();

  scene.handleResize();

  if (import.meta.env.DEV) {
    (window as unknown as { __debugScene?: WorldScene; __debugInput?: typeof input; __debugProgress?: Progress }).__debugScene = scene;
    (window as unknown as { __debugInput?: typeof input }).__debugInput = input;
    (window as unknown as { __debugProgress?: Progress }).__debugProgress = progress;
  }

  function tryInteract(): void {
    if (nearIndex === null) return;
    const idx = nearIndex;

    if (idx < quizzes.length) {
      if (interactionOpen) return;
      const quiz = quizzes[idx];
      if (!quiz || progress.completedQuizzes.includes(quiz.id)) return;
      interactionOpen = true;
      hud.setInteractVisible(false);
      audio.playInteract();
      openQuizModal(root!, quiz, {
        onCorrect: () => {
          audio.playCorrect();
          if (!progress.completedQuizzes.includes(quiz.id)) {
            progress.completedQuizzes.push(quiz.id);
            progress.energy += 1;
            saveProgress(progress);
            syncEnergyHud();
          }
          scene.markStationSolved(idx);
          hud.setStatus(forestStatusText());
        },
        onWrong: () => audio.playWrong(),
        onClose: () => {
          interactionOpen = false;
        },
      });
    } else if (idx === dragonIndex) {
      // Action combat: each press fires one energy blast at the dragon (rate-limited, costs energy).
      if (progress.dragonDefeated || attackCooldown > 0) return;
      if (progress.energy <= 0) {
        audio.playWrong();
        return;
      }
      attackCooldown = ATTACK_COOLDOWN;
      progress.energy -= 1;
      saveProgress(progress);
      syncEnergyHud();

      const result = scene.attackDragon();
      hud.showDragonHp(result.hp, result.max);
      audio.playCorrect();

      if (result.justDefeated) {
        progress.dragonDefeated = true;
        saveProgress(progress);
        audio.playUnlock();
        hud.hideDragonHp();
        hud.setStatus("드래곤을 물리쳤어요!");
        window.setTimeout(() => showEnding(), 900);
      }
    }
  }

  function showEnding(): void {
    renderEndingScreen(root!, progress, hexToCss(currentAvatarColor()), quizzes.length);
  }

  const keyMap: Record<string, keyof typeof input> = {
    w: "up",
    arrowup: "up",
    s: "down",
    arrowdown: "down",
    a: "left",
    arrowleft: "left",
    d: "right",
    arrowright: "right",
  };

  window.addEventListener("keydown", (e) => {
    const key = e.key.toLowerCase();
    if (e.code === "Space") {
      if (!interactionOpen) input.jump = true;
      e.preventDefault();
    } else if (key in keyMap) {
      if (!interactionOpen) input[keyMap[key]] = true;
      e.preventDefault();
    } else if (key === "e") {
      tryInteract();
    }
  });
  window.addEventListener("keyup", (e) => {
    const key = e.key.toLowerCase();
    if (e.code === "Space") {
      input.jump = false;
      e.preventDefault();
    } else if (key in keyMap) {
      input[keyMap[key]] = false;
      e.preventDefault();
    }
  });
  window.addEventListener("resize", () => scene.handleResize());
  window.addEventListener("blur", () => {
    input.up = input.down = input.left = input.right = input.jump = false;
  });

  if (progress.dragonDefeated) {
    showEnding();
  }

  let lastTime = performance.now();
  function tick(): void {
    const now = performance.now();
    const delta = Math.min((now - lastTime) / 1000, 0.05);
    lastTime = now;

    if (attackCooldown > 0) attackCooldown -= delta;

    if (nearIndex === dragonIndex && !progress.dragonDefeated) {
      energyRegenTimer += delta;
      if (energyRegenTimer >= ENERGY_REGEN_INTERVAL) {
        energyRegenTimer = 0;
        progress.energy += 1;
        saveProgress(progress);
        syncEnergyHud();
      }
    } else {
      energyRegenTimer = 0;
    }

    if (!interactionOpen) {
      scene.update(delta, input);
    }
    scene.render();
    requestAnimationFrame(tick);
  }
  tick();

  if (import.meta.env.DEV) {
    (window as unknown as { __debugTick?: () => void }).__debugTick = tick;
  }
}

showStartScreen();
