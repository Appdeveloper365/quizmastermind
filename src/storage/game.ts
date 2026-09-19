export interface GameStats { highScore: number; bestStreak: number; played: number; correct: number; }
const KEY = "quiz.stats";
export function loadStats(): GameStats {
  try { return { highScore: 0, bestStreak: 0, played: 0, correct: 0, ...JSON.parse(localStorage.getItem(KEY) ?? "{}") }; }
  catch { return { highScore: 0, bestStreak: 0, played: 0, correct: 0 }; }
}
export function saveStats(s: GameStats) { localStorage.setItem(KEY, JSON.stringify(s)); }
