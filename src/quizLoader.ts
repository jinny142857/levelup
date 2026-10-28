import type { QuizQuestion } from "./types";
import { loadQuizOverride } from "./storage";

function validateQuizSet(data: unknown): QuizQuestion[] {
  if (!Array.isArray(data) || data.length === 0) {
    throw new Error("문제 목록이 비어 있어요.");
  }
  for (const raw of data) {
    if (typeof raw !== "object" || raw === null) {
      throw new Error("문제 형식이 올바르지 않아요.");
    }
    const q = raw as Partial<QuizQuestion>;
    if (typeof q.id !== "string" || typeof q.question !== "string" || typeof q.hint !== "string" || typeof q.explanation !== "string") {
      throw new Error("문제 형식이 올바르지 않아요. (id, question, hint, explanation 확인)");
    }
    if (q.type === "mc") {
      if (!Array.isArray(q.choices) || q.choices.length !== 4 || typeof q.correctIndex !== "number") {
        throw new Error(`[${q.id}] 객관식 문제는 choices[4]와 correctIndex가 필요해요.`);
      }
    } else if (q.type === "short") {
      if (!Array.isArray(q.acceptedAnswers) || q.acceptedAnswers.length === 0) {
        throw new Error(`[${q.id}] 주관식 문제는 acceptedAnswers 목록이 필요해요.`);
      }
    } else {
      throw new Error(`[${q.id}] type은 "mc" 또는 "short"여야 해요.`);
    }
  }
  return data as QuizQuestion[];
}

export async function loadQuizSet(): Promise<QuizQuestion[]> {
  const override = loadQuizOverride();
  if (override) {
    try {
      return validateQuizSet(JSON.parse(override));
    } catch (err) {
      console.warn("저장된 교사 문제 불러오기 실패, 기본 문제를 사용합니다.", err);
    }
  }
  const res = await fetch("/data/quiz.json");
  const data = await res.json();
  return validateQuizSet(data);
}

export function parseUploadedQuizJson(text: string): QuizQuestion[] {
  const data = JSON.parse(text);
  return validateQuizSet(data);
}
