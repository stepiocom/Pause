/**
 * Pause (停) — Content Script
 * Adds 5-second friction and pattern detection to web-based AI chats.
 * Fully local. No servers, no analytics, no accounts.
 */

(function () {
  "use strict";

  // ─── Constants ───────────────────────────────────────────────────────────────

  const PAUSE_DURATION = 5000; // ms
  const QUICK_EXCHANGE_THRESHOLD = 30000; // ms
  const SIMILARITY_THRESHOLD = 0.65;
  const STORAGE_KEY = "pause_session";
  const MAX_HISTORY = 50;

  // ─── Site Adapters ────────────────────────────────────────────────────────────
  // Each adapter teaches Pause where to find AI responses on a specific site.

  const SITE_ADAPTERS = [
    {
      name: "ChatGPT",
      match: /chat\.openai\.com|chatgpt\.com/,
      responseSelector: '[data-message-author-role="assistant"]',
      inputSelector: "#prompt-textarea",
      streamingIndicator: '.result-streaming, [data-testid="stop-button"]',
    },
    {
      name: "Claude",
      match: /claude\.ai/,
      responseSelector: '[data-is-streaming="false"] .font-claude-message',
      inputSelector: '[contenteditable="true"]',
      streamingIndicator: '[data-is-streaming="true"]',
    },
    {
      name: "Gemini",
      match: /gemini\.google\.com/,
      responseSelector: "message-content.model-response-text",
      inputSelector: ".ql-editor",
      streamingIndicator: ".loading-indicator",
    },
    {
      name: "Copilot",
      match: /copilot\.microsoft\.com|bing\.com\/chat/,
      responseSelector: '[data-content="ai-message"]',
      inputSelector: "#searchbox",
      streamingIndicator: ".stop-responding-button",
    },
    {
      name: "Perplexity",
      match: /perplexity\.ai/,
      responseSelector: ".prose",
      inputSelector: "textarea",
      streamingIndicator: ".stop-button",
    },
    {
      name: "Poe",
      match: /poe\.com/,
      responseSelector: ".ChatMessage_messageWrapper__.*[data-complete='true']",
      inputSelector: "textarea",
      streamingIndicator: ".ChatMessage_messageWrapper__:not([data-complete])",
    },
    {
      name: "Generic",
      match: /.*/,
      responseSelector: null, // Uses heuristic detection
      inputSelector: "textarea, [contenteditable]",
      streamingIndicator: null,
    },
  ];

  // ─── Pattern Data (loaded from extension files) ──────────────────────────────

  let PATTERNS = null;
  let WHY_DATA = null;
  let lang = navigator.language.startsWith("zh") ? "zh" : "en";

  // ─── Session State ────────────────────────────────────────────────────────────

  let session = {
    messages: [], // { text, timestamp, length }
    lastMessageTime: null,
    responseLengths: [],
    enabled: true,
  };

  // ─── Utilities ────────────────────────────────────────────────────────────────

  function getHour() {
    return new Date().getHours();
  }

  function msSince(ts) {
    return Date.now() - ts;
  }

  /**
   * Simple Jaccard similarity on word sets.
   */
  function similarity(a, b) {
    const wordsA = new Set(a.toLowerCase().split(/\s+/));
    const wordsB = new Set(b.toLowerCase().split(/\s+/));
    const intersection = [...wordsA].filter((w) => wordsB.has(w)).length;
    const union = new Set([...wordsA, ...wordsB]).size;
    return union === 0 ? 0 : intersection / union;
  }

  /**
   * Load JSON data bundled with the extension.
   */
  async function loadData() {
    try {
      const [pRes, wRes] = await Promise.all([
        fetch(chrome.runtime.getURL("patterns.json")),
        fetch(chrome.runtime.getURL("why-this-matters.json")),
      ]);
      PATTERNS = await pRes.json();
      WHY_DATA = await wRes.json();
    } catch (e) {
      console.warn("[Pause] Could not load data files:", e);
    }
  }

  /**
   * Get the active site adapter for the current page.
   */
  function getAdapter() {
    return (
      SITE_ADAPTERS.find((a) => a.match.test(location.hostname)) ||
      SITE_ADAPTERS[SITE_ADAPTERS.length - 1]
    );
  }

  // ─── Detection Engine ─────────────────────────────────────────────────────────

  /**
   * Detect patterns in the AI response text.
   * Returns array of matched pattern IDs.
   */
  function detectPatterns(text) {
    if (!PATTERNS) return [];
    const lower = text.toLowerCase();
    const found = [];

    for (const pattern of PATTERNS.patterns) {
      let matched = false;

      // Check keywords
      for (const kw of pattern.triggers.keywords) {
        if (lower.includes(kw.toLowerCase())) {
          matched = true;
          break;
        }
      }

      // Check phrases
      if (!matched) {
        for (const ph of pattern.triggers.phrases) {
          if (lower.includes(ph.toLowerCase())) {
            matched = true;
            break;
          }
        }
      }

      if (matched) {
        found.push(pattern.id);
      }
    }

    return found;
  }

  /**
   * Detect context signals based on session state.
   * Returns array of matched signal IDs.
   */
  function detectContext(responseText) {
    const signals = [];
    const hour = getHour();

    // Late night
    if ([22, 23, 0, 1, 2, 3, 4].includes(hour)) {
      signals.push("late_night");
    }

    // Quick back-and-forth
    if (
      session.lastMessageTime &&
      msSince(session.lastMessageTime) < QUICK_EXCHANGE_THRESHOLD
    ) {
      signals.push("quick_exchange");
    }

    // Repetition — compare to last 5 messages
    const recent = session.messages.slice(-5);
    for (const prev of recent) {
      if (similarity(responseText, prev.text) > SIMILARITY_THRESHOLD) {
        signals.push("repetition");
        break;
      }
    }

    // Growing responses
    if (session.responseLengths.length >= 3) {
      const avg =
        session.responseLengths
          .slice(0, -1)
          .reduce((a, b) => a + b, 0) /
        (session.responseLengths.length - 1);
      const latest = session.responseLengths[session.responseLengths.length - 1];
      if (avg > 0 && (latest - avg) / avg > 0.4) {
        signals.push("growing_responses");
      }
    }

    return signals;
  }

  // ─── Overlay UI ───────────────────────────────────────────────────────────────

  /**
   * Build and inject the pause overlay.
   * Returns a Promise that resolves when the user dismisses or countdown ends.
   */
  function showPauseOverlay(patterns, contextSignals, responseEl) {
    return new Promise((resolve) => {
      const allSignals = [...patterns, ...contextSignals];
      const overlay = document.createElement("div");
      overlay.className = "pause-overlay";
      overlay.setAttribute("role", "dialog");
      overlay.setAttribute("aria-modal", "true");
      overlay.setAttribute("aria-label", lang === "zh" ? "停 — 暫停提示" : "Pause — Awareness prompt");

      // ── Header ──
      const header = document.createElement("div");
      header.className = "pause-header";

      const title = document.createElement("div");
      title.className = "pause-title";
      title.textContent = lang === "zh" ? "停" : "Pause";

      const subtitle = document.createElement("div");
      subtitle.className = "pause-subtitle";
      subtitle.textContent =
        lang === "zh"
          ? "回應將在 5 秒後顯示"
          : "Response shows in 5 seconds";

      const countdown = document.createElement("div");
      countdown.className = "pause-countdown";
      countdown.textContent = "5";

      header.append(title, subtitle, countdown);

      // ── Intent check ──
      if (WHY_DATA) {
        const intentData = WHY_DATA.intent_check[lang];
        const intentBlock = document.createElement("div");
        intentBlock.className = "pause-intent";
        intentBlock.innerHTML = `<span class="pause-intent-label">${intentData.prompt}</span> ${intentData.question}`;
        header.append(intentBlock);
      }

      overlay.append(header);

      // ── Patterns ──
      if (allSignals.length > 0 && WHY_DATA) {
        const section = document.createElement("div");
        section.className = "pause-patterns";

        for (const id of allSignals) {
          const exp = WHY_DATA.explanations[id];
          if (!exp) continue;
          const d = exp[lang];

          const card = document.createElement("div");
          card.className = "pause-pattern-card";

          const labelRow = document.createElement("div");
          labelRow.className = "pause-pattern-label-row";

          const labelChip = document.createElement("span");
          labelChip.className = `pause-chip pause-chip-${id}`;
          const patternDef =
            PATTERNS &&
            (PATTERNS.patterns.find((p) => p.id === id) ||
              PATTERNS.context_signals.find((s) => s.id === id));
          labelChip.textContent =
            patternDef
              ? lang === "zh"
                ? patternDef.label_zh
                : patternDef.label_en
              : id;

          labelRow.append(labelChip);
          card.append(labelRow);

          const why = document.createElement("p");
          why.className = "pause-why";
          why.textContent = d.why;

          const question = document.createElement("p");
          question.className = "pause-question";
          question.textContent = "→ " + d.question;

          card.append(why, question);
          section.append(card);
        }

        overlay.append(section);
      } else if (allSignals.length === 0) {
        const noPattern = document.createElement("p");
        noPattern.className = "pause-no-pattern";
        noPattern.textContent =
          lang === "zh"
            ? "未偵測到特定模式。"
            : "No patterns detected this time.";
        overlay.append(noPattern);
      }

      // ── Actions ──
      const actions = document.createElement("div");
      actions.className = "pause-actions";

      const continueBtn = document.createElement("button");
      continueBtn.className = "pause-btn pause-btn-continue";
      continueBtn.textContent = lang === "zh" ? "繼續閱讀" : "Continue";
      continueBtn.addEventListener("click", () => dismiss("continue"));

      const stopBtn = document.createElement("button");
      stopBtn.className = "pause-btn pause-btn-stop";
      stopBtn.textContent = lang === "zh" ? "先停一下" : "Stop";
      stopBtn.addEventListener("click", () => dismiss("stop"));

      const langToggle = document.createElement("button");
      langToggle.className = "pause-btn pause-btn-lang";
      langToggle.textContent = lang === "zh" ? "EN" : "中";
      langToggle.title =
        lang === "zh" ? "Switch to English" : "切換為中文";
      langToggle.addEventListener("click", () => {
        lang = lang === "zh" ? "en" : "zh";
        chrome.storage.local.set({ pause_lang: lang });
        dismiss("lang_toggle");
        // Re-show with new language (the observer will re-trigger on next response)
      });

      actions.append(continueBtn, stopBtn, langToggle);
      overlay.append(actions);

      // ── Dismiss logic ──
      let timer;
      let remaining = PAUSE_DURATION / 1000;

      function tick() {
        remaining--;
        countdown.textContent = remaining;
        if (remaining <= 0) {
          dismiss("timeout");
        }
      }

      timer = setInterval(tick, 1000);

      function dismiss(reason) {
        clearInterval(timer);
        overlay.classList.add("pause-fadeout");
        setTimeout(() => {
          overlay.remove();
        }, 300);
        resolve(reason);
      }

      // Inject into page
      document.body.appendChild(overlay);
      continueBtn.focus();
    });
  }

  // ─── Response Interception ────────────────────────────────────────────────────

  /**
   * Hide an element and return a restore function.
   */
  function hideElement(el) {
    const prev = {
      visibility: el.style.visibility,
      opacity: el.style.opacity,
      pointerEvents: el.style.pointerEvents,
    };
    el.style.visibility = "hidden";
    el.style.opacity = "0";
    el.style.pointerEvents = "none";

    return function restore() {
      el.style.visibility = prev.visibility;
      el.style.opacity = prev.opacity;
      el.style.pointerEvents = prev.pointerEvents;
      el.classList.add("pause-reveal");
    };
  }

  /**
   * Called when a new AI response is ready. Runs the full Pause flow.
   */
  async function handleResponse(responseEl) {
    if (!session.enabled) return;
    const text = responseEl.innerText || responseEl.textContent || "";
    if (text.trim().length < 20) return; // Skip very short snippets

    // Update session
    session.lastMessageTime = Date.now();
    session.messages.push({ text, timestamp: Date.now() });
    if (session.messages.length > MAX_HISTORY) session.messages.shift();
    session.responseLengths.push(text.length);
    if (session.responseLengths.length > MAX_HISTORY) session.responseLengths.shift();

    // Detect
    const patterns = detectPatterns(text);
    const context = detectContext(text);

    // Hide response, show overlay
    const restore = hideElement(responseEl);
    await showPauseOverlay(patterns, context, responseEl);
    restore();
  }

  // ─── DOM Observer ─────────────────────────────────────────────────────────────

  const seen = new WeakSet();

  function setupObserver() {
    const adapter = getAdapter();

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType !== Node.ELEMENT_NODE) continue;

          let responseEl = null;

          if (adapter.responseSelector) {
            // Use site-specific selector
            if (node.matches && node.matches(adapter.responseSelector)) {
              responseEl = node;
            } else {
              responseEl = node.querySelector(adapter.responseSelector);
            }
          } else {
            // Heuristic: look for large new text blocks
            responseEl = heuristicDetect(node);
          }

          if (responseEl && !seen.has(responseEl)) {
            // Wait for streaming to finish if applicable
            if (adapter.streamingIndicator) {
              waitForStreamEnd(responseEl, adapter).then(() => {
                if (!seen.has(responseEl)) {
                  seen.add(responseEl);
                  handleResponse(responseEl);
                }
              });
            } else {
              seen.add(responseEl);
              handleResponse(responseEl);
            }
          }
        }
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });
  }

  /**
   * Heuristic: finds a newly added element that looks like a substantial AI reply.
   */
  function heuristicDetect(node) {
    // Prefer elements with role="presentation" or article, or long paragraphs
    const candidates = node.querySelectorAll
      ? node.querySelectorAll("article, [role='presentation'], .response, .answer")
      : [];
    for (const el of candidates) {
      if ((el.innerText || "").length > 100) return el;
    }
    if ((node.innerText || "").length > 100) return node;
    return null;
  }

  /**
   * Poll until streaming stops (streaming indicator disappears).
   */
  function waitForStreamEnd(responseEl, adapter) {
    return new Promise((resolve) => {
      const check = () => {
        const streaming = adapter.streamingIndicator
          ? document.querySelector(adapter.streamingIndicator)
          : null;
        if (!streaming) {
          resolve();
        } else {
          setTimeout(check, 300);
        }
      };
      // Short initial delay so streaming can start
      setTimeout(check, 800);
    });
  }

  // ─── Popup Communication ──────────────────────────────────────────────────────

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === "get_status") {
      sendResponse({ enabled: session.enabled, lang });
    } else if (message.type === "set_enabled") {
      session.enabled = message.value;
      chrome.storage.local.set({ pause_enabled: message.value });
      sendResponse({ ok: true });
    } else if (message.type === "set_lang") {
      lang = message.value;
      chrome.storage.local.set({ pause_lang: lang });
      sendResponse({ ok: true });
    } else if (message.type === "get_stats") {
      sendResponse({
        messageCount: session.messages.length,
        avgLength:
          session.responseLengths.length > 0
            ? Math.round(
                session.responseLengths.reduce((a, b) => a + b, 0) /
                  session.responseLengths.length
              )
            : 0,
      });
    }
  });

  // ─── Initialisation ───────────────────────────────────────────────────────────

  async function init() {
    // Load stored preferences
    const stored = await chrome.storage.local.get(["pause_enabled", "pause_lang"]);
    if (stored.pause_enabled === false) session.enabled = false;
    if (stored.pause_lang) lang = stored.pause_lang;

    // Load pattern + explanation data
    await loadData();

    // Watch for AI responses
    setupObserver();
  }

  // Only run once DOM is ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
