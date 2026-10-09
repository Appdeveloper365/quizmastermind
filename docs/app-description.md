# Quiz Mastermind — app description

Copy-ready descriptions of the app, in several lengths. Every claim below was checked against the code.

---

## One-liner

> **Quiz Mastermind** — a free browser quiz that writes you a fresh trivia question every time, powered by AI you choose: free cloud, your own key, or entirely on your device.

## Short (≈50 words — repo About, link preview, intro paragraph)

> **Quiz Mastermind** is a free, no-signup trivia quiz that runs entirely in your browser. Type any subject, pick a difficulty, and an AI writes a fresh multiple-choice question with an explanation every time — with no repeats, a running score, and a streak. Choose your AI: free cloud (Puter), your own API key, or a model running privately on your device.

## Medium (≈150 words — landing page, README blurb)

> **Quiz Mastermind** is a free AI trivia quiz you can open and use in seconds — no account, no install, no server on our side.
>
> Type any subject ("Ancient Egypt", "Python basics", "90s pop music"), choose easy/medium/hard, and press **Start**. The AI writes a brand-new multiple-choice question with four plausible options and an explanation of why the answer is right. Everything you've already been asked is remembered on your device, so questions never repeat — even after you close and reopen the app. Track your score, streak and accuracy, and let it auto-advance you through a run.
>
> You pick where the AI runs: **free cloud AI** (Puter — no key to manage), **your own API key** (Gemini, Groq, Pollinations, OpenRouter or xAI), **your own machine** (Ollama or LM Studio), or **in your browser** (WebLLM — downloads a small model once, then generates offline). Your prompts and keys stay between you and the provider you chose.

## Long (≈300 words — Play Store, About page)

> **Quiz Mastermind** turns any subject into a private, AI-written quiz.
>
> ### How it works
> 1. **Type a subject** — anything from quantum physics to 80s sitcoms — and choose a difficulty.
> 2. **Press Start** — the AI writes a fresh multiple-choice question, four options, exactly one correct, plus an explanation you can read after answering.
> 3. **Answer and learn** — get an immediate right/wrong reveal, watch your score, streak and accuracy climb, and continue for as long as you like.
>
> ### Built to stay interesting
> - **No repeats, ever** — every question you've seen is remembered per topic on your device (up to 500), and the app checks each new question against them before showing it.
> - **Quality gates** — malformed answers, near-duplicates, and copy-paste model glitches are rejected and retried automatically, so you rarely see a broken question.
> - **Fresh angles** — each request steers the model toward a different slice of the topic (history, science, people, records, myths…), so long runs don't feel copy-pasted.
> - **Score, streaks and stats** — high score, best streak, and accuracy, kept locally.
> - **Auto-advance** — a short countdown takes you to the next question without clicking.
>
> ### Your AI, your choice
> - **☁️ Puter** — free cloud AI on your own Puter account; no key to paste.
> - **🔑 Your own API key** — bring a free key from Gemini, Groq, Pollinations, OpenRouter or xAI.
> - **💻 Your own machine** — detect and use Ollama or LM Studio running locally.
> - **🌐 In your browser** — WebLLM + WebGPU: download a model once (~500 MB–1.8 GB), then questions generate on-device and offline.
>
> ### Privacy by architecture
> There is no Quiz Mastermind account, database or backend: the site is static files on GitHub Pages. Scores, history, preferences and any API keys you paste live only in your browser. Prompts go only to the provider you picked — pick the local or in-browser AI and nothing leaves your device at all. No analytics, no ads, no tracking.
>
> Works on desktop and mobile browsers, installs as a PWA, and an Android APK is published on the app's GitHub Releases page.

## Play Store listing

- **Title (≤30 chars):** `Quiz Mastermind: AI Trivia`
- **Short description (≤80 chars):** `Free AI trivia quiz. Fresh questions every time, your AI, your rules.`
- **Long description:** use the *Long* text above.

## Suggested GitHub repo "About" description

```
Free AI trivia quiz PWA — fresh MCQs with explanations, no repeats, no accounts. Cloud, your own key, or on-device AI.
```

---

## Facts this description is built on

| Claim | Where it comes from |
|---|---|
| Fresh question every request, 4 options + explanation | `src/quiz/schema.ts` validation |
| No repeats per topic (500 cap) | `src/storage/history.ts` + dedup in `src/quiz/engine.ts` |
| Providers: Puter, Gemini, Groq, Pollinations, OpenRouter, xAI, Ollama/LM Studio, WebLLM | `src/providers/registry.ts`, `src/providers/local.ts`, `src/providers/webllm.ts` |
| Model sizes ~500 MB / 1.1 GB / 1.8 GB | `WEBLLM_MODELS` in `src/providers/webllm.ts` |
| Score/streak/accuracy, auto-advance, difficulties | `src/main.ts`, `src/storage/game.ts` |
| No account/server/analytics, data stays in the browser | No backend in repo; `public/privacy-policy.html` |
| PWA + APK | `public/manifest.webmanifest`, `public/sw.js`, sidebar link to GitHub Releases |
