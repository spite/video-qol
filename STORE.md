# Chrome Web Store listing

Copy these into the developer dashboard when submitting `dist/video-qol-<version>.zip`.

## Store listing

**Name:** Video QoL

**Summary** (from the manifest, 132 characters max):
Speed control, frame screenshots, downloads and a pop-out player with its own controls, for videos on any site.

**Category:** Productivity → Tools

**Homepage URL:** https://spite.github.io/video-qol/

**Support URL:** https://github.com/spite/video-qol/issues

**Description:**

Better controls for every video on the web.

Hover any video to get a small control bar:

• Speed: slow down or speed up any video from 0.06× to 16×, beyond the site's own limits. Set a default speed and a speed per site in the options.
• Frame by frame: step one frame at a time while paused, or jump 5 seconds.
• Screenshots: save the exact frame you're looking at as a full-resolution PNG.
• Downloads: save videos that play from a single file.
• Pop-out player: arm a video, or list sites that arm automatically, and it floats in its own window when you switch tabs, with play/pause, seek, volume, speed, screenshot and fullscreen controls, plus subtitles on Netflix and YouTube.

Keyboard shortcuts work on every site, and you can change any of them:
[ and ] — slower / faster
\ — toggle 1× and your last speed
, and . — previous / next frame (while paused)
Alt+, and Alt+. — back / forward 5 seconds
Alt+S — screenshot
Alt+P — pop out when switching tabs
Alt+Shift+P — pop out now

Shortcuts are ignored while you type, and the control bar stays out of the way of menus and pop-ups that cover the video. Prefer keys only? Hide the bar everywhere or on chosen sites.

No tracking, no accounts, no data collected.

Note: streamed and DRM-protected videos (YouTube, Netflix and similar) can't be downloaded; the download button only appears when there is a file to save.

## Graphics

Made by `node store/make-assets.mjs`, which captures the extension's real UI from headless Chromium on a demo page. Upload from `store/images/`:

- **Store icon:** `icons/icon128.png` (96×96 artwork with 16 px padding, as the store asks).
- **Screenshots** (1280×800, in this order): `screenshot-1-speed.png`, `screenshot-2-frames.png`, `screenshot-3-popout.png`, `screenshot-4-options.png`.
- **Small promo tile** (440×280): `promo-small-440x280.png`.
- **Marquee promo tile** (1400×560): `marquee-1400x560.png`.

## Privacy practices tab

**Single purpose:**
Adds playback controls to videos on web pages: speed, screenshots, downloads and a pop-out player.

**Permission justifications:**

- `storage`: Saves the user's settings (speeds, sites, keyboard shortcuts) in Chrome's synced storage.
- `downloads`: Saves a video file to the user's downloads when they click the download button.
- Host permission `<all_urls>`: The controls must work on videos on any site the user visits. It is also required by `chrome.tabs.captureVisibleTab`, used to screenshot videos whose frames the site does not allow the extension to read directly.

**Remote code:** No, I am not using remote code.

**Data usage:** The extension collects none of the listed data types. Check all three certifications (no selling or transferring data to third parties, no use unrelated to the single purpose, no use for creditworthiness or lending).

**Privacy policy URL:** https://github.com/spite/video-qol/blob/main/PRIVACY.md

## Review notes

- The broad host permission triggers an in-depth review, which can take longer than usual.
- The extension never downloads from YouTube: its videos are streamed, so the download button is hidden there. Store policy rejects extensions that download YouTube videos.
