import type { QuizQuestion } from "../types";

export interface QuizModalCallbacks {
  onCorrect: () => void;
  onWrong: () => void;
  onClose: () => void;
}

function normalizeAnswer(text: string): string {
  return text.replace(/\s+/g, "").toLowerCase();
}

function isCorrectShortAnswer(input: string, accepted: string[]): boolean {
  const normalized = normalizeAnswer(input);
  if (!normalized) return false;
  return accepted.some((a) => normalizeAnswer(a) === normalized);
}

export function openQuizModal(root: HTMLElement, question: QuizQuestion, callbacks: QuizModalCallbacks): void {
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";

  const card = document.createElement("div");
  card.className = "panel quiz-card";
  overlay.appendChild(card);

  if (question.passage) {
    const passageBox = document.createElement("div");
    passageBox.className = "quiz-passage";
    passageBox.textContent = question.passage;
    card.appendChild(passageBox);
  }

  const questionEl = document.createElement("h2");
  questionEl.className = "quiz-question";
  questionEl.textContent = question.question;
  card.appendChild(questionEl);

  const hintText = document.createElement("p");
  hintText.className = "quiz-hint hidden";
  hintText.textContent = `힌트: ${question.hint}`;

  const feedback = document.createElement("div");
  feedback.className = "quiz-feedback hidden";

  let solved = false;

  function showCorrectFeedback(): void {
    solved = true;
    feedback.classList.remove("hidden");
    feedback.innerHTML = "";
    const okText = document.createElement("p");
    okText.className = "feedback-ok";
    okText.textContent = "정답이에요! 🎉";
    const explain = document.createElement("p");
    explain.className = "feedback-explain";
    explain.textContent = question.explanation;
    const closeBtn = document.createElement("button");
    closeBtn.className = "btn btn-primary";
    closeBtn.textContent = "확인";
    closeBtn.addEventListener("click", () => {
      overlay.remove();
      callbacks.onClose();
    });
    feedback.appendChild(okText);
    feedback.appendChild(explain);
    feedback.appendChild(closeBtn);
    callbacks.onCorrect();
  }

  if (question.type === "mc") {
    const choiceList = document.createElement("div");
    choiceList.className = "quiz-choices";
    const buttons: HTMLButtonElement[] = [];

    question.choices.forEach((choiceText, index) => {
      const btn = document.createElement("button");
      btn.className = "btn quiz-choice-btn";
      btn.textContent = choiceText;
      btn.addEventListener("click", () => {
        if (solved) return;
        if (index === question.correctIndex) {
          btn.classList.add("correct");
          buttons.forEach((b) => (b.disabled = true));
          showCorrectFeedback();
        } else {
          btn.classList.add("wrong");
          callbacks.onWrong();
          window.setTimeout(() => btn.classList.remove("wrong"), 500);
        }
      });
      buttons.push(btn);
      choiceList.appendChild(btn);
    });

    card.appendChild(choiceList);
  } else {
    const inputRow = document.createElement("div");
    inputRow.className = "quiz-short-row";
    const input = document.createElement("input");
    input.className = "text-input quiz-short-input";
    input.placeholder = "답을 입력하세요";
    input.maxLength = 30;

    const submitBtn = document.createElement("button");
    submitBtn.className = "btn btn-primary";
    submitBtn.textContent = "확인하기";

    const acceptedAnswers = question.acceptedAnswers;
    function trySubmit(): void {
      if (solved) return;
      if (isCorrectShortAnswer(input.value, acceptedAnswers)) {
        input.disabled = true;
        submitBtn.disabled = true;
        showCorrectFeedback();
      } else {
        input.classList.add("wrong");
        callbacks.onWrong();
        window.setTimeout(() => input.classList.remove("wrong"), 500);
      }
    }

    submitBtn.addEventListener("click", trySubmit);
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") trySubmit();
    });

    inputRow.appendChild(input);
    inputRow.appendChild(submitBtn);
    card.appendChild(inputRow);
  }

  const hintBtn = document.createElement("button");
  hintBtn.className = "btn btn-secondary hint-btn";
  hintBtn.textContent = "힌트 보기";
  hintBtn.addEventListener("click", () => {
    hintText.classList.remove("hidden");
  });

  card.appendChild(hintBtn);
  card.appendChild(hintText);
  card.appendChild(feedback);

  root.appendChild(overlay);

  if (question.type === "short") {
    const input = card.querySelector<HTMLInputElement>(".quiz-short-input");
    input?.focus();
  }
}
