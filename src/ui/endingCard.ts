import { AVATAR_NAMES, type Progress } from "../types";

function drawCard(canvas: HTMLCanvasElement, progress: Progress, avatarColorCss: string, quizTotal: number): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const W = canvas.width;
  const H = canvas.height;

  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, "#2a2155");
  bg.addColorStop(1, "#0b1026");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  ctx.strokeStyle = "#ffd166";
  ctx.lineWidth = 6;
  ctx.strokeRect(14, 14, W - 28, H - 28);

  ctx.textAlign = "center";
  ctx.fillStyle = "#ffd166";
  ctx.font = "bold 34px sans-serif";
  ctx.fillText("판타지아: 마지막 레벨업", W / 2, 80);
  ctx.fillStyle = "#c7cdfa";
  ctx.font = "20px sans-serif";
  ctx.fillText("드래곤 토벌 기록", W / 2, 114);

  ctx.beginPath();
  ctx.arc(W / 2, 220, 70, 0, Math.PI * 2);
  ctx.fillStyle = avatarColorCss;
  ctx.fill();
  ctx.font = "54px sans-serif";
  ctx.fillStyle = "#fff";
  ctx.fillText("🐉", W / 2, 240);

  ctx.font = "bold 28px sans-serif";
  ctx.fillStyle = "#fff";
  ctx.fillText(progress.nickname, W / 2, 335);

  ctx.font = "18px sans-serif";
  ctx.fillStyle = "#c7cdfa";
  ctx.fillText(`${AVATAR_NAMES[progress.avatarId] ?? ""}`, W / 2, 365);

  ctx.font = "bold 24px sans-serif";
  ctx.fillStyle = "#ffd166";
  ctx.fillText(`🧩 빌런 퀴즈 ${quizTotal} / ${quizTotal} 처치`, W / 2, 440);

  ctx.font = "bold 24px sans-serif";
  ctx.fillStyle = "#7fe3c3";
  ctx.fillText("🐉 드래곤 보스 물리치기 완료!", W / 2, 480);

  ctx.font = "18px sans-serif";
  ctx.fillStyle = "#e8eaff";
  ctx.fillText("책 『마지막 레벨업』을 끝까지 읽고", W / 2, 560);
  ctx.fillText("모든 문제를 해결했어요.", W / 2, 586);

  ctx.font = "16px sans-serif";
  ctx.fillStyle = "#9aa0d8";
  ctx.fillText("함께 성장해요! ✨", W / 2, H - 40);
}

export function renderEndingScreen(root: HTMLElement, progress: Progress, avatarColorCss: string, quizTotal: number): void {
  const overlay = document.createElement("div");
  overlay.className = "screen ending-screen";

  const heading = document.createElement("h1");
  heading.className = "game-title";
  heading.textContent = "드래곤을 물리쳤어요!";
  overlay.appendChild(heading);

  const sub = document.createElement("p");
  sub.className = "game-subtitle";
  sub.textContent = `${AVATAR_NAMES[progress.avatarId] ?? ""} ${progress.nickname} 님이 모든 문제를 풀고 숲을 구했어요.`;
  overlay.appendChild(sub);

  const printWrap = document.createElement("div");
  printWrap.className = "ending-card-print";
  const canvas = document.createElement("canvas");
  canvas.width = 640;
  canvas.height = 820;
  canvas.className = "ending-card-canvas";
  printWrap.appendChild(canvas);
  overlay.appendChild(printWrap);

  drawCard(canvas, progress, avatarColorCss, quizTotal);

  const btnRow = document.createElement("div");
  btnRow.className = "btn-row";

  const downloadBtn = document.createElement("button");
  downloadBtn.className = "btn btn-primary";
  downloadBtn.textContent = "카드 다운로드";
  downloadBtn.addEventListener("click", () => {
    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `fantasia_card_${progress.nickname}.png`;
      a.click();
      URL.revokeObjectURL(url);
    }, "image/png");
  });

  const printBtn = document.createElement("button");
  printBtn.className = "btn btn-secondary";
  printBtn.textContent = "인쇄하기";
  printBtn.addEventListener("click", () => window.print());

  const closeBtn = document.createElement("button");
  closeBtn.className = "btn btn-secondary";
  closeBtn.textContent = "닫고 더 둘러보기";
  closeBtn.addEventListener("click", () => overlay.remove());

  btnRow.appendChild(downloadBtn);
  btnRow.appendChild(printBtn);
  btnRow.appendChild(closeBtn);
  overlay.appendChild(btnRow);

  root.appendChild(overlay);
}
