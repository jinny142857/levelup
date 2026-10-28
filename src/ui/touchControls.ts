export interface TouchInput {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
  jump: boolean;
}

/**
 * On-screen movement D-pad + jump button for touch tablets with no keyboard.
 * Hidden via CSS on devices with a fine pointer (mouse/trackpad); shown on
 * coarse-pointer/touch-only devices. Writes directly into the shared input
 * object, same as the keyboard handlers in main.ts.
 */
export class TouchControls {
  private root: HTMLElement;

  constructor(root: HTMLElement, input: TouchInput) {
    this.root = document.createElement("div");
    this.root.className = "touch-controls";

    const dpad = document.createElement("div");
    dpad.className = "dpad";

    const makeBtn = (label: string, cell: string, key: keyof TouchInput): HTMLButtonElement => {
      const btn = document.createElement("button");
      btn.className = `dpad-btn dpad-${cell}`;
      btn.textContent = label;
      const press = (e: Event) => {
        e.preventDefault();
        input[key] = true;
      };
      const release = (e: Event) => {
        e.preventDefault();
        input[key] = false;
      };
      btn.addEventListener("pointerdown", press);
      btn.addEventListener("pointerup", release);
      btn.addEventListener("pointercancel", release);
      btn.addEventListener("pointerleave", release);
      return btn;
    };

    dpad.appendChild(makeBtn("▲", "up", "up"));
    dpad.appendChild(makeBtn("◀", "left", "left"));
    dpad.appendChild(makeBtn("▶", "right", "right"));
    dpad.appendChild(makeBtn("▼", "down", "down"));

    const jumpBtn = document.createElement("button");
    jumpBtn.className = "jump-btn";
    jumpBtn.textContent = "점프";
    const pressJump = (e: Event) => {
      e.preventDefault();
      input.jump = true;
    };
    const releaseJump = (e: Event) => {
      e.preventDefault();
      input.jump = false;
    };
    jumpBtn.addEventListener("pointerdown", pressJump);
    jumpBtn.addEventListener("pointerup", releaseJump);
    jumpBtn.addEventListener("pointercancel", releaseJump);
    jumpBtn.addEventListener("pointerleave", releaseJump);

    this.root.appendChild(dpad);
    this.root.appendChild(jumpBtn);
    root.appendChild(this.root);
  }

  destroy(): void {
    this.root.remove();
  }
}
