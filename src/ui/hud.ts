export interface HudCallbacks {
  onInteract: () => void;
  onMuteToggle: () => void;
  onRestart: () => void;
}

export class Hud {
  private root: HTMLElement;
  private regionNameEl: HTMLElement;
  private statusEl: HTMLElement;
  private energyEl: HTMLElement;
  private interactBtn: HTMLButtonElement;
  private muteBtn: HTMLButtonElement;
  private dragonHpBar: HTMLElement;
  private dragonHpFill: HTMLElement;
  private dragonHpLabel: HTMLElement;
  private callbacks: HudCallbacks;

  constructor(root: HTMLElement, callbacks: HudCallbacks) {
    this.callbacks = callbacks;
    this.root = document.createElement("div");
    this.root.className = "hud";

    const topBar = document.createElement("div");
    topBar.className = "hud-top";

    const leftGroup = document.createElement("div");
    leftGroup.className = "hud-left-group";

    this.regionNameEl = document.createElement("span");
    this.regionNameEl.className = "hud-region";

    const statusRow = document.createElement("div");
    statusRow.className = "hud-status-row";

    this.statusEl = document.createElement("span");
    this.statusEl.className = "hud-progress";

    this.energyEl = document.createElement("span");
    this.energyEl.className = "hud-energy";
    this.energyEl.textContent = "⚡ 0";

    statusRow.appendChild(this.statusEl);
    statusRow.appendChild(this.energyEl);

    leftGroup.appendChild(this.regionNameEl);
    leftGroup.appendChild(statusRow);
    topBar.appendChild(leftGroup);

    const topButtons = document.createElement("div");
    topButtons.className = "hud-top-buttons";

    this.muteBtn = document.createElement("button");
    this.muteBtn.className = "hud-icon-btn";
    this.muteBtn.textContent = "🔊";
    this.muteBtn.title = "소리 끄기/켜기";
    this.muteBtn.addEventListener("click", () => this.callbacks.onMuteToggle());

    const restartBtn = document.createElement("button");
    restartBtn.className = "hud-icon-btn";
    restartBtn.textContent = "⟲";
    restartBtn.title = "처음부터 다시 시작";
    restartBtn.addEventListener("click", () => {
      if (confirm("저장된 모험 기록이 사라져요. 정말 처음부터 다시 시작할까요?")) {
        this.callbacks.onRestart();
      }
    });

    topButtons.appendChild(this.muteBtn);
    topButtons.appendChild(restartBtn);
    topBar.appendChild(topButtons);

    this.dragonHpBar = document.createElement("div");
    this.dragonHpBar.className = "dragon-hp-bar hidden";
    this.dragonHpLabel = document.createElement("div");
    this.dragonHpLabel.className = "dragon-hp-label";
    this.dragonHpLabel.textContent = "🐉 드래곤";
    const dragonHpTrack = document.createElement("div");
    dragonHpTrack.className = "dragon-hp-track";
    this.dragonHpFill = document.createElement("div");
    this.dragonHpFill.className = "dragon-hp-fill";
    dragonHpTrack.appendChild(this.dragonHpFill);
    this.dragonHpBar.appendChild(this.dragonHpLabel);
    this.dragonHpBar.appendChild(dragonHpTrack);

    const bottomBar = document.createElement("div");
    bottomBar.className = "hud-bottom";
    bottomBar.textContent = "방향키/WASD 또는 화면 버튼으로 이동 · 점프 · 가까이 가면 버튼으로 탐색/공격";

    this.interactBtn = document.createElement("button");
    this.interactBtn.className = "interact-btn hidden";
    this.interactBtn.textContent = "E 탐색하기";
    this.interactBtn.addEventListener("click", () => this.callbacks.onInteract());

    this.root.appendChild(topBar);
    this.root.appendChild(this.dragonHpBar);
    this.root.appendChild(this.interactBtn);
    this.root.appendChild(bottomBar);
    root.appendChild(this.root);
  }

  setRegionName(name: string): void {
    this.regionNameEl.textContent = name;
  }

  setStatus(text: string): void {
    this.statusEl.textContent = text;
  }

  setEnergy(value: number): void {
    this.energyEl.textContent = `⚡ ${value}`;
  }

  setInteractVisible(visible: boolean): void {
    this.interactBtn.classList.toggle("hidden", !visible);
  }

  setInteractLabel(text: string): void {
    this.interactBtn.textContent = text;
  }

  showDragonHp(hp: number, max: number): void {
    this.dragonHpBar.classList.remove("hidden");
    const pct = Math.max(0, Math.min(100, (hp / max) * 100));
    this.dragonHpFill.style.width = `${pct}%`;
    this.dragonHpLabel.textContent = `🐉 드래곤 ${hp} / ${max}`;
  }

  hideDragonHp(): void {
    this.dragonHpBar.classList.add("hidden");
  }

  setMuted(muted: boolean): void {
    this.muteBtn.textContent = muted ? "🔇" : "🔊";
  }

  destroy(): void {
    this.root.remove();
  }
}
