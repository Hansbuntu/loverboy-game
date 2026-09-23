# Loverboy O'Clock: the game

A promo companion game for TD's *Loverboy O'Clock*. You run and jump through seven levels, one per track.
Clear a level to unlock its song; clear all seven to reach the early-access signup.

Plain static HTML, CSS and JavaScript. **No build step, no dependencies.** Upload the folder anywhere (GitHub Pages, Netlify, ...).

## Run it

```bash
npm start          # http://localhost:5174  (a tiny zero-dependency dev server)
```

Any static server works. Browsers block ES modules on `file://`, so opening `index.html` by double-click won't run it.

## Publish on GitHub Pages

Push the folder, then Settings, Pages, deploy from the branch root. Nothing else to configure.

## What to edit

Everything you will want to change is in **one file: `js/config.js`**.

| Setting | What it does |
|---|---|
| `album` | artist, title, tagline and the three how-to-play lines on the start screen |
| `email.endpoint` | your Formspree URL. The game POSTs `{"email": "..."}` to it |
| `previewMs` | how long the unlock card plays the song (10 s by default; capped to the real clip length) |
| `levels[]` | per track: `track` title, `colors` palette, `goal`, `difficulty`, `bg` image, `tile` icon |

### The audio

Drop the song clips in `audio/`, named `track-01.mp3` to `track-07.mp3` (about 10 seconds each). Missing files are fine:
the unlock card falls back to a short silent preview. Set a level's `audio` in the config to use a different path.

The preview clips are public files, so only put in what you're happy for anyone to download.

### The art

All images are in `assets/` (see `assets/README.md` for names and sizes). Replace any PNG with your own of the same name and nothing else needs to change. If an image is missing, the game falls back to plain colours and shapes.

```bash
npm run prep -- sheet.png   # slice an AI-generated asset sheet into the runner, obstacles and icons
npm run art                 # draw placeholder art for anything that is missing (never overwrites)
```

The runner, obstacles and unlock icons came from an AI sheet via `npm run prep`. The seven level backgrounds and the favicon
are still placeholder art drawn by `npm run art`.

## How the game plays

- Tap, click, Space or Up to jump. **Hold to leap higher.** The runner moves on its own.
- Each level has a `goal`: how many obstacles to get past. It grows level by level.
- Difficulty comes from what appears, not just how much: pits from level 3, floating platforms from level 4, and from
  level 4 some obstacles slide sideways at random moments from the halfway point.
- Fail: screen shake, a fail sound, a buzz, and a death animation, then "Tap to retry". The same level restarts.
- Clear: an unlock card plays the song. That song then plays quietly under the next level, pauses when you fail, and
  resumes when you retry.
- Progress is saved in the browser (`localStorage`), so a reload keeps your unlocks.
- After level 7: the end screen with the early-access form.

All sound effects are synthesized with Web Audio: there are no sound files. Phones get haptics (Android vibration;
iPhone via the hidden-switch trick, iOS 17.4+).

## Email signup

The form checks the address, then POSTs JSON to `email.endpoint`. It shows success only if the request works. Nothing
secret is in the page: a Formspree form id is public by design. Clear the endpoint to save addresses in the browser only.

## Tests

```bash
npm test
```

Built-in Node test runner, nothing to install. Covers the physics, the saved progress, the email handling, the runner's run cycle, and the levels:
a bot **plays every level** (with sliding obstacles in their worst positions, at desktop and phone sizes) and the test
fails if any level can't be finished. Run it after changing a level's difficulty in `config.js`.

## Layout

| Path | What |
|---|---|
| `index.html`, `css/style.css` | the page |
| `js/config.js` | all content and tuning |
| `js/app.js` | the flow: start, play, fail, unlock, finale |
| `js/runner.js` | the game: state, drawing, particles |
| `js/course.js`, `js/physics.js`, `js/player.js`, `js/collisions.js` | level building and movement (no DOM) |
| `js/audio.js`, `js/haptics.js`, `js/progress.js`, `js/email.js`, `js/input.js`, `js/loop.js`, `js/sprites.js` | supporting pieces |
| `assets/`, `audio/` | images, fonts, songs |
| `tools/` | the art generator (development only) |
| `tests/` | the tests (development only) |

Fonts are self-hosted and OFL-licensed (`assets/fonts/README.md`).
