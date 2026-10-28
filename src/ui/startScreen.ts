import { AVATAR_COLORS, AVATAR_NAMES } from "../types";
import { hexToCss } from "../colorUtil";

export interface StartScreenOptions {
  hasSave: boolean;
  savedNickname: string;
  onStart: (nickname: string, avatarId: number) => void;
  onContinue: () => void;
  onRestart: () => void;
  getQuizTemplateText: () => Promise<string>;
  onQuizUpload: (text: string) => void;
}

export function renderStartScreen(root: HTMLElement, opts: StartScreenOptions): void {
  root.innerHTML = "";

  const overlay = document.createElement("div");
  overlay.className = "screen start-screen";

  const title = document.createElement("h1");
  title.className = "game-title";
  title.textContent = "판타지아: 마지막 레벨업";
  overlay.appendChild(title);

  const subtitle = document.createElement("p");
  subtitle.className = "game-subtitle";
  subtitle.textContent = "책 속 세상을 탐험하며 친구와 나를 발견해 보아요.";
  overlay.appendChild(subtitle);

  if (opts.hasSave) {
    const resumeCard = document.createElement("div");
    resumeCard.className = "panel resume-card";

    const resumeText = document.createElement("p");
    resumeText.textContent = `"${opts.savedNickname}" 모험가님, 다시 모험을 떠나볼까요?`;
    resumeCard.appendChild(resumeText);

    const btnRow = document.createElement("div");
    btnRow.className = "btn-row";

    const continueBtn = document.createElement("button");
    continueBtn.className = "btn btn-primary";
    continueBtn.textContent = "이어하기";
    continueBtn.addEventListener("click", () => opts.onContinue());

    const restartBtn = document.createElement("button");
    restartBtn.className = "btn btn-secondary";
    restartBtn.textContent = "처음부터 다시 시작";
    restartBtn.addEventListener("click", () => {
      if (confirm("저장된 모험 기록이 사라져요. 정말 처음부터 다시 시작할까요?")) {
        opts.onRestart();
      }
    });

    btnRow.appendChild(continueBtn);
    btnRow.appendChild(restartBtn);
    resumeCard.appendChild(btnRow);
    overlay.appendChild(resumeCard);
  } else {
    const formCard = document.createElement("div");
    formCard.className = "panel";

    const label = document.createElement("label");
    label.className = "field-label";
    label.textContent = "모험가 이름을 적어 주세요 (실제 이름 대신 별명도 좋아요!)";
    const nicknameInput = document.createElement("input");
    nicknameInput.type = "text";
    nicknameInput.maxLength = 8;
    nicknameInput.placeholder = "예: 별빛여우";
    nicknameInput.className = "text-input";
    label.appendChild(nicknameInput);
    formCard.appendChild(label);

    const privacyNote = document.createElement("p");
    privacyNote.className = "privacy-note";
    privacyNote.textContent = "개인정보(실명, 전화번호 등)는 적지 않아도 괜찮아요.";
    formCard.appendChild(privacyNote);

    const avatarLabel = document.createElement("p");
    avatarLabel.className = "field-label";
    avatarLabel.textContent = "나의 모험가를 선택해요";
    formCard.appendChild(avatarLabel);

    const avatarRow = document.createElement("div");
    avatarRow.className = "avatar-row";
    let selectedAvatar = 0;
    const avatarButtons: HTMLButtonElement[] = [];

    AVATAR_COLORS.forEach((color, index) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "avatar-swatch" + (index === 0 ? " selected" : "");
      btn.style.setProperty("--avatar-color", hexToCss(color));
      btn.title = AVATAR_NAMES[index];
      btn.addEventListener("click", () => {
        selectedAvatar = index;
        avatarButtons.forEach((b, i) => b.classList.toggle("selected", i === index));
      });
      avatarButtons.push(btn);
      avatarRow.appendChild(btn);
    });
    formCard.appendChild(avatarRow);

    const startBtn = document.createElement("button");
    startBtn.className = "btn btn-primary start-btn";
    startBtn.textContent = "탐험 시작하기";
    startBtn.addEventListener("click", () => {
      const nickname = nicknameInput.value.trim() || "이름없는 모험가";
      opts.onStart(nickname, selectedAvatar);
    });
    formCard.appendChild(startBtn);

    overlay.appendChild(formCard);
  }

  const teacherToggle = document.createElement("button");
  teacherToggle.className = "teacher-toggle";
  teacherToggle.textContent = "교사용 문제 설정";
  overlay.appendChild(teacherToggle);

  const teacherPanel = document.createElement("div");
  teacherPanel.className = "panel teacher-panel hidden";

  const teacherDesc = document.createElement("p");
  teacherDesc.textContent = "기본 문제 양식을 내려받아 수정한 뒤, 이 파일을 다시 올려 주세요.";
  teacherPanel.appendChild(teacherDesc);

  const teacherBtnRow = document.createElement("div");
  teacherBtnRow.className = "btn-row";

  const downloadBtn = document.createElement("button");
  downloadBtn.className = "btn btn-secondary";
  downloadBtn.textContent = "문제 양식 내려받기";
  downloadBtn.addEventListener("click", async () => {
    const text = await opts.getQuizTemplateText();
    const blob = new Blob([text], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "fantasia_quiz_template.json";
    a.click();
    URL.revokeObjectURL(url);
  });

  const uploadLabel = document.createElement("label");
  uploadLabel.className = "btn btn-secondary file-label";
  uploadLabel.textContent = "수정한 문제 올리기";
  const uploadInput = document.createElement("input");
  uploadInput.type = "file";
  uploadInput.accept = "application/json";
  uploadInput.className = "hidden-file-input";
  uploadInput.addEventListener("change", async () => {
    const file = uploadInput.files?.[0];
    if (!file) return;
    const text = await file.text();
    try {
      opts.onQuizUpload(text);
      teacherStatus.textContent = "새 문제가 적용되었어요!";
      teacherStatus.className = "teacher-status ok";
    } catch (err) {
      teacherStatus.textContent = `문제 파일을 확인해 주세요: ${(err as Error).message}`;
      teacherStatus.className = "teacher-status error";
    }
  });
  uploadLabel.appendChild(uploadInput);

  const teacherStatus = document.createElement("p");
  teacherStatus.className = "teacher-status";

  teacherBtnRow.appendChild(downloadBtn);
  teacherBtnRow.appendChild(uploadLabel);
  teacherPanel.appendChild(teacherBtnRow);
  teacherPanel.appendChild(teacherStatus);
  overlay.appendChild(teacherPanel);

  teacherToggle.addEventListener("click", () => {
    teacherPanel.classList.toggle("hidden");
  });

  root.appendChild(overlay);
}
