# 停 Pause — AI Chat Awareness Extension

> Adds 5 seconds of friction and pattern detection to web-based AI chats.  
> Helps you notice influence techniques — without replacing your judgment.

---

## What it does

When an AI chat responds, Pause:

1. **Holds the response** for 5 seconds behind a calm overlay
2. **Detects patterns** in the response text (urgency, social proof, authority claims, flattery, false binaries, loaded framing)
3. **Notes your context** (late night, rapid exchange, repeated question, growing response length)
4. **Shows why it matters** — one plain sentence per pattern, plus a reflection question
5. **Lets you choose**: Continue reading, stop, or adjust your question

No score. No recommendation. No "correct" action.

---

## What it does NOT do

| Not included | Why |
|---|---|
| API calls to AI services | Violates terms of service |
| Server or analytics | Fully local by design |
| Accounts or login | None needed |
| Recommendations | Replaces your judgment |
| Score or rating | Creates optimization pressure |
| Mobile app | Separate project scope |

---

## Supported sites

- ChatGPT (chat.openai.com, chatgpt.com)
- Claude (claude.ai)
- Gemini (gemini.google.com)
- Copilot (copilot.microsoft.com, bing.com/chat)
- Perplexity (perplexity.ai)
- Poe (poe.com)
- Character.AI (character.ai)
- You.com

To add more sites, edit `manifest.json` (host_permissions + content_scripts matches) and add an adapter in `content.js`.

---

## Detected patterns

| Pattern | Label (EN) | Label (中) |
|---|---|---|
| Time pressure language | Urgency | 緊迫感 |
| Popularity as evidence | Social proof | 從眾效應 |
| High-confidence claims | Authority claim | 權威宣稱 |
| Opening praise | Flattery | 奉承讚美 |
| Only two choices presented | False binary | 非此即彼 |
| Unconfirmed assumptions | Loaded framing | 預設立場 |

**Context signals:**

| Signal | Label (EN) | Label (中) |
|---|---|---|
| Hours 22:00–04:00 | Late night | 深夜使用 |
| < 30s between messages | Quick back-and-forth | 快速來回 |
| Similar question asked before | Repeated question | 重複提問 |
| Responses >40% longer than avg | Growing responses | 回應越來越長 |

---

## Install (developer mode)

1. Download or clone this repository
2. Open Chrome → `chrome://extensions`
3. Enable **Developer mode** (top right toggle)
4. Click **Load unpacked**
5. Select the `pause-extension/` folder
6. Visit any supported AI chat site

**Firefox:** Go to `about:debugging` → This Firefox → Load Temporary Add-on → select `manifest.json`

---

## File structure

```
pause-extension/
├── manifest.json          # Extension config (Manifest V3)
├── content.js             # Detection logic + overlay UI
├── pause.css              # Overlay styling
├── background.js          # Service worker (install events)
├── popup.html             # Extension popup
├── popup.js               # Popup logic
├── patterns.json          # Detectable technique definitions
├── why-this-matters.json  # Bilingual explanations
├── icons/
│   ├── icon16.png
│   ├── icon48.png
│   ├── icon128.png
│   ├── icon16.svg         # Source SVGs
│   ├── icon48.svg
│   ├── icon128.svg
│   └── generate-icons.js  # Icon generator script (dev only)
├── LICENSE
└── README.md
```

---

## Customise patterns

Edit `patterns.json`. Each pattern needs:

```json
{
  "id": "my_pattern",
  "label_en": "My Pattern",
  "label_zh": "我的模式",
  "triggers": {
    "keywords": ["word1", "word2"],
    "phrases": ["exact phrase here"]
  },
  "weight": 1.0
}
```

Then add a matching entry in `why-this-matters.json` under `explanations`.

---

## Language

Default: your browser's language setting.

Toggle in the extension popup or in the overlay itself (EN / 中 button).

Supported: English, Traditional Chinese. To add more languages, extend `why-this-matters.json` and the `i18n` objects in `popup.js`.

---

## Privacy

- **No server.** All detection runs locally in your browser.
- **No analytics.** Nothing is transmitted anywhere.
- **No accounts.** No sign-in, no profile.
- **Storage:** Only `pause_enabled` and `pause_lang` preferences are stored locally via the browser's extension storage API.
- **History:** Session message history lives in memory and is cleared when you close the tab.

---

## Contributing

This is an open-source project. MIT licensed.

Good contributions:
- Additional site adapters
- Better pattern detection (more nuanced keyword sets)
- Improved heuristic detection for unsupported sites
- Translations

Please do not add:
- Server components
- Analytics or telemetry
- Scoring or rating systems
- Recommendations

---

## License

MIT — free to use, modify, and distribute.  
See `LICENSE` for full text.
