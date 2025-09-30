# Aurora Chrome Extension

Aurora is evolving into a research companion that keeps the inspiring posts you like on X.com in sync with your Liner knowledge base. The extension will watch for new likes, capture the key metadata, and send the content straight to Liner so your reading queue stays organized.

## Current Status

- Minimal popup UI with rotating focus prompts (`src/popup.html`, `src/popup.js`).
- Manifest v3 scaffold ready for additional background scripts and permissions (`src/manifest.json`).
- Placeholder icons under `assets/icons/`; replace before release.

## Planned Workflow

1. Authenticate the user against X.com to access the `favorites/list` (likes) endpoint.
2. Poll or stream liked posts, normalizing title, author, URL, and timestamp.
3. Push each like into the Liner API with proper rate limiting and retry handling.
4. Surface sync activity inside the Aurora popup so users can confirm recently transferred posts.

## Getting Started

1. Open `chrome://extensions/` in a Chromium-based browser.
2. Enable **Developer mode**.
3. Click **Load unpacked** and choose the repository's `src/` directory.

## Development Notes

- Background/service worker logic will live under `src/background/` (to be implemented).
- Shared helpers for X.com and Liner integrations should be added under `src/shared/`.
- Secrets (API tokens, cookies) belong in a gitignored `.env.local`; document required keys in `docs/configuration.md` when defined.

## Roadmap

- [ ] Build authenticated client for X.com likes.
- [ ] Implement Liner API wrapper with retry safeguards.
- [ ] Persist sync state locally to avoid duplicate transfers.
- [ ] Replace popup placeholder with sync insights and manual retry controls.
- [ ] Design a distinctive icon set for Aurora.
