/**
 * Pause (停) — Popup Script
 */

(async function () {
  const enableToggle = document.getElementById("enableToggle");
  const statusDot = document.getElementById("statusDot");
  const statusLabel = document.getElementById("statusLabel");
  const msgCount = document.getElementById("msgCount");
  const avgLen = document.getElementById("avgLen");
  const btnEn = document.getElementById("btnEn");
  const btnZh = document.getElementById("btnZh");

  // i18n strings
  const i18n = {
    en: {
      active: "Active",
      paused: "Paused",
      session: "This session",
      responses: "responses",
      avgLen: "avg length",
      language: "Language",
      footer: "No server. No data sent. Fully local.",
    },
    zh: {
      active: "運行中",
      paused: "已暫停",
      session: "本次對話",
      responses: "個回應",
      avgLen: "平均長度",
      language: "語言",
      footer: "無伺服器。不傳送資料。完全本地。",
    },
  };

  // Load stored state
  const stored = await chrome.storage.local.get(["pause_enabled", "pause_lang"]);
  let enabled = stored.pause_enabled !== false;
  let lang = stored.pause_lang || (navigator.language.startsWith("zh") ? "zh" : "en");

  function applyLang() {
    const t = i18n[lang];
    statusLabel.textContent = enabled ? t.active : t.paused;
    document.getElementById("statsLabel").textContent = t.session;
    document.getElementById("msgLabel").textContent = t.responses;
    document.getElementById("lenLabel").textContent = t.avgLen;
    document.getElementById("langLabel").textContent = t.language;
    document.getElementById("footer").innerHTML =
      t.footer + `<br /><a href="https://github.com/your-username/pause-extension" target="_blank">GitHub</a> &nbsp;·&nbsp; MIT License`;

    btnEn.classList.toggle("active", lang === "en");
    btnZh.classList.toggle("active", lang === "zh");
  }

  function applyEnabled() {
    enableToggle.checked = enabled;
    statusDot.className = "status-dot" + (enabled ? "" : " off");
    statusLabel.textContent = i18n[lang][enabled ? "active" : "paused"];
  }

  // Get stats from content script
  async function loadStats() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) return;
      const response = await chrome.tabs.sendMessage(tab.id, { type: "get_stats" }).catch(() => null);
      if (response) {
        msgCount.textContent = response.messageCount ?? "—";
        avgLen.textContent = response.avgLength ? response.avgLength + " ch" : "—";
      }
    } catch (_) {
      // Content script not running on this page
      msgCount.textContent = "—";
      avgLen.textContent = "—";
    }
  }

  // Toggle enabled
  enableToggle.addEventListener("change", async () => {
    enabled = enableToggle.checked;
    applyEnabled();
    await chrome.storage.local.set({ pause_enabled: enabled });
    // Notify active tab
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.id) {
        chrome.tabs.sendMessage(tab.id, { type: "set_enabled", value: enabled }).catch(() => {});
      }
    } catch (_) {}
  });

  // Language buttons
  btnEn.addEventListener("click", async () => {
    lang = "en";
    await chrome.storage.local.set({ pause_lang: lang });
    applyLang();
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.id) chrome.tabs.sendMessage(tab.id, { type: "set_lang", value: lang }).catch(() => {});
    } catch (_) {}
  });

  btnZh.addEventListener("click", async () => {
    lang = "zh";
    await chrome.storage.local.set({ pause_lang: lang });
    applyLang();
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.id) chrome.tabs.sendMessage(tab.id, { type: "set_lang", value: lang }).catch(() => {});
    } catch (_) {}
  });

  // Init
  applyEnabled();
  applyLang();
  await loadStats();
})();
