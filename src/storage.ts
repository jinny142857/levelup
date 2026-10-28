import type { Progress, Settings } from "./types";

const PROGRESS_KEY = "fantasia_progress_v1";
const SETTINGS_KEY = "fantasia_settings_v1";
const QUIZ_OVERRIDE_KEY = "fantasia_quiz_override_v1";

export function loadProgress(): Progress | null {
  const raw = localStorage.getItem(PROGRESS_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Progress;
  } catch {
    return null;
  }
}

export function saveProgress(progress: Progress): void {
  localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress));
}

export function clearProgress(): void {
  localStorage.removeItem(PROGRESS_KEY);
}

export function loadSettings(): Settings {
  const raw = localStorage.getItem(SETTINGS_KEY);
  if (!raw) return { muted: false, reduceMotion: false };
  try {
    return { muted: false, reduceMotion: false, ...JSON.parse(raw) } as Settings;
  } catch {
    return { muted: false, reduceMotion: false };
  }
}

export function saveSettings(settings: Settings): void {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

export function loadQuizOverride(): string | null {
  return localStorage.getItem(QUIZ_OVERRIDE_KEY);
}

export function saveQuizOverride(json: string): void {
  localStorage.setItem(QUIZ_OVERRIDE_KEY, json);
}

export function clearQuizOverride(): void {
  localStorage.removeItem(QUIZ_OVERRIDE_KEY);
}
