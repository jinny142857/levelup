export interface QuizQuestionBase {
  id: string;
  question: string;
  hint: string;
  explanation: string;
  /** Optional reading passage shown above the question (used by some short-answer items). */
  passage?: string;
}

export interface MCQuizQuestion extends QuizQuestionBase {
  type: "mc";
  choices: string[];
  correctIndex: number;
}

export interface ShortQuizQuestion extends QuizQuestionBase {
  type: "short";
  acceptedAnswers: string[];
}

export type QuizQuestion = MCQuizQuestion | ShortQuizQuestion;

export interface Progress {
  nickname: string;
  avatarId: number;
  completedQuizzes: string[];
  stompedObstacles: string[];
  energy: number;
  dragonDefeated: boolean;
}

export interface Settings {
  muted: boolean;
  reduceMotion: boolean;
}

export const AVATAR_COLORS = [0x4c6ef5, 0x2fb380, 0x9b5de5, 0xff8c42];
export const AVATAR_NAMES = ["파란 모험가", "초록 모험가", "보라 모험가", "주황 모험가"];
