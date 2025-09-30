# Aurora Chrome Extension

Aurora is a minimalist Chrome extension that refreshes your new tab popup with a rotating focus prompt so you can stay on track.

## Getting Started

1. Open `chrome://extensions/` in your Chromium browser.
2. Enable **Developer mode**.
3. Click **Load unpacked** and choose this repository's `src/` directory.

## Development Notes

- The extension entry point is defined in `src/manifest.json`.
- Popup UI lives in `src/popup.html` with logic in `src/popup.js`.
- Icons are placeholder 1×1 images located under `assets/icons/`; replace them before releasing.

## Roadmap

- Add persistent storage for quick captures.
- Introduce lightweight task integrations.
- Design a distinctive icon set for Aurora.
