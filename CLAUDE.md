# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Aurora is a Chrome extension (Manifest V3) that syncs X.com liked posts to Liner knowledge base. Currently in early development with minimal popup UI.

## Development Workflow

**Loading the extension:**
1. Navigate to `chrome://extensions/`
2. Enable **Developer mode**
3. Click **Load unpacked** and select the `src/` directory
4. Reload extension after changes

**Packaging for distribution:**
- Build output is in `dist/aurora-extension/`
- Zip archives created in `dist/aurora-extension.zip`

## Architecture

**Current structure:**
- `src/manifest.json` - Manifest V3 configuration
- `src/popup.html` + `src/popup.js` - Extension popup with rotating focus prompts
- `assets/icons/` - Placeholder icons (need replacement before release)
- No build tooling currently (plain HTML/JS, no TypeScript/bundler)

**Planned architecture (not yet implemented):**
- `src/background/` - Service worker for X.com API polling and Liner sync
- `src/shared/` - Shared utilities for X.com and Liner API integration
- Local storage for sync state to prevent duplicate transfers
- Authentication flow for X.com `favorites/list` endpoint

## Key Technical Details

**X.com → Liner sync workflow:**
1. Authenticate user with X.com to access liked posts
2. Poll/stream liked posts, normalize metadata (title, author, URL, timestamp)
3. Push to Liner API with rate limiting and retry logic
4. Display sync activity in popup UI

**Configuration:**
- Secrets (API tokens, cookies) should go in `.env.local` (gitignored)
- Document required environment variables in `docs/configuration.md`

**Extension permissions:**
- Currently none defined in manifest
- Will need `host_permissions` for X.com and Liner API domains
- May need `storage` permission for sync state

## Important Context

- Follow [AGENTS.md](AGENTS.md) for repository-wide coding standards (Conventional Commits, testing guidelines, file naming)
- See [README.md](README.md) roadmap for planned features
- This is a greenfield project - major components (background worker, API clients, storage) are not yet implemented
