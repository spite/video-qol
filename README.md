# Video QoL

A Chrome extension that adds speed control, frame screenshots, downloads and a pop-out player to videos on any site.

## Features

Hover a video to show a small control bar in its top-left corner.

| Feature | Bar | Keyboard |
|---|---|---|
| Slower / faster, in 0.25 steps from 0.06× to 16× | − / + | `[` / `]` |
| Toggle between 1× and the last speed | the speed readout | `\` |
| Previous / next frame (while paused) | — | `,` / `.` |
| Back / forward 5 seconds | — | `Alt+,` / `Alt+.` |
| Save the current frame as a full-resolution PNG | camera | `Alt+S` |
| Download the video (only when it plays from a single file) | download | — |
| Pop the video out when you switch tabs | pop-out (blue when on) | `Alt+P` |
| Pop the video out now | — | `Alt+Shift+P` |

- **Speed** comes from the options page: a default for all sites, plus a speed per site (covering its subdomains; embedded videos use the page's site). Keyboard changes last until the page reloads. The chosen speed is reapplied when a site resets it on its own.
- **Arming** for pop-out on tab switch belongs to the page: it ends when the page moves on to another video (YouTube's next video, a playlist), but not for a timestamp change. Sites in the options' **auto-arm** list arm their main video automatically once it plays with sound; un-arming there sticks until the next video.
- **Options** open from the toolbar icon, or right-click it → Options. They save as you type and sync with your Chrome profile.
- **Frame step** measures the video's real frame rate while it plays, falling back to 30 fps. The keys only act on a paused video, so sites keep `,` and `.` while playing.
- **Pop-out** opens a floating window with the video and its own controls: a seek bar with time, seek ±10s, play/pause/replay, speed, screenshot, fullscreen and close. Fullscreen (button, `F` or double-click) puts the video back in its tab, switching to that tab if needed, and presses the player's own fullscreen control (YouTube, video.js, Plyr, JW Player, or any button labelled full screen). Players without one get the video itself fullscreen with Chrome's built-in controls. Keys inside it: `Space`, `←`/`→`, `,`/`.`, `[`, `]`, `\`, `Alt+S`, `F`. Subtitles drawn by Netflix and YouTube are copied into the window.
- Shortcuts are ignored while typing in a text field, and only act on a video that is on screen.

### Limits

- **Download** only works for videos played from a single file. Streamed video (YouTube, Twitch, Netflix and most large sites) has no file to save, so the button is hidden there. DRM-protected video is never downloaded.
- **Screenshots** of video from another site fall back to capturing the visible area of the tab, which is limited to screen resolution.
- **Pop-out** only works for videos in the main page, not in embedded frames.
- **Pop-out on tab switch** is decided by Chrome. It needs the video to be playing with sound, and Chrome must allow automatic picture-in-picture for the site. If nothing happens, open the site settings from the address bar and set **Automatic picture-in-picture** to Allow.

## Install for development

1. Open `chrome://extensions` and turn on **Developer mode**.
2. Click **Load unpacked** and pick this folder.
3. After editing, click the reload icon on the extension's card and reload the page.

## Files

| File | Runs in | Does |
|---|---|---|
| `content.js` | every frame, isolated world | control bar, shortcuts, speed, frame step, screenshots, downloads |
| `settings.js` | content script and options page | settings defaults and site matching |
| `options.html`, `options.js` | options page | default speed, site speeds, shortcut reference |
| `pip.js` | top frame, page world | pop-out window and the tab-switch trigger |
| `page.js` | every frame, page world | tells streamed `blob:` videos apart from files |
| `icons.js` | both worlds | SVG icons, built without HTML strings for Trusted Types sites |
| `background.js` | service worker | `chrome.downloads`, the tab-capture screenshot fallback, toolbar icon → options |

## Test

```
node test/smoke.mjs
```

Loads the extension into headless Chromium and checks the bar, shortcuts, frame step, screenshot, download, covered-video handling, pop-out with its seek bar, recovery after an extension reload, and the options page against a local test page. `PIP_SHOT=/path.png` and `OPT_SHOT=/path/prefix` also save screenshots of the pop-out window and the options page. Needs Node 22+, `ffmpeg` with libvpx, and a Chromium build: branded Google Chrome no longer accepts `--load-extension`. It uses Playwright's Chromium if installed, or `CHROME=/path/to/chromium`.

## Debugging fullscreen from the pop-out

`pip.js` keeps a short trace of recent fullscreen attempts in the page: each step, the button it used, and any error, stamped with a build id. In the page's console, `copy(__videoQolTrace.join('\n'))` copies it.

## Release

```
python3 build.py
```

Writes `dist/video-qol-<version>.zip` with only the files the manifest references. Bump `version` in `manifest.json` before each upload. The store listing text and permission justifications are in [STORE.md](STORE.md), and the privacy policy is in [PRIVACY.md](PRIVACY.md).
