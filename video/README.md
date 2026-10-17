# Cream City Almanac explainer video

A Remotion project (video written as React code and rendered to MP4), kept separate from the site: it has its own packages, and the site's build, typecheck, tests and Vercel upload all skip this folder.

- `npm test`: checks the on-screen copy against the spec's claims table, the timeline, the snapshot and the recording math.
- `CONVEX_URL=https://spotted-tern-278.convex.cloud node scripts/snapshot.mjs`: refreshes the two on-screen figures from production (`src/data.json`, dated). It writes nothing if either answer can't be shown.
- Re-record the City Hall address lookup (from the repo root): `node video/scripts/record-address.playwright.mjs`, then trim and extend it as decision 056 describes and update `src/clip.ts`. (`scripts/record-address.mjs` is the ego-browser version; on this machine it only reached 8.7 frames a second.)
- `npx remotion studio`: preview. Each scene is also its own composition under Scenes.
- `npx remotion render CreamCityAlmanac out/cream-city-almanac-90s.mp4` and `npx remotion render CreamCityAlmanacVertical out/cream-city-almanac-30s-vertical.mp4`: the videos.
- `npx remotion still Thumbnail out/thumbnail-youtube.png` and `npx remotion still ThumbnailVertical out/thumbnail-vertical.png`: the covers.

Music: see `MUSIC.md` (check the license before posting). Spec: `docs/superpowers/specs/2026-10-16-explainer-video-design.md`.
