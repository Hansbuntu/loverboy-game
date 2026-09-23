All images the game uses. Replace any of them with your own PNG of the same name and nothing else needs to change.
Keep pixel art crisp (no smoothing or blur). Missing images fall back to plain shapes and colours.

| Folder | Files | Size | Notes |
|---|---|---|---|
| `backgrounds/` | `level-01.png` ... `level-07.png` | 320x200 (or any 16:10 art, such as 640x400) | Shown behind the level, scaled to cover the field. The floor covers roughly the bottom 16%, so keep detail above that. The camera drifts slowly across it as you progress. |
| `sprites/` | `run-1..8.png`, `jump.png`, `fall.png`, `death-1..4.png` | 40x40 (any size up to about 48) | The runner. Drawn at exactly this size, feet on the **bottom row**, centered, facing right. The 8 run frames are one full stride: a foot plants in front, pushes back, lifts and swings forward, then the other leg does the same. |
| `source/` | `run-1..4.png` | 40x40 | The AI's original 4 run frames. `npm run prep` keeps them here and builds the 8-frame cycle from them (`tools/build-run-cycle.js`). |
| `sprites/` | `spike.png` (28x28), `block.png` (16x16 tile), `blockcap.png` (16x5 tile) | | Obstacles. **Draw them light grey**: the game tints them to each level's `obstacle` colour. |
| `tiles/` | `tile-01.png` ... `tile-07.png` | 32x32 | The icon on the "Track unlocked" card (shown at 4x). |
| `icons/` | `favicon-16.png`, `favicon-32.png`, `apple-touch-icon.png` | 16, 32, 180 | Browser tab and home-screen icons. |
| `fonts/` | woff2 files | | See `fonts/README.md`. |

## Making the images

- **Sprites and icons from an AI sheet:** `npm run prep -- path/to/sheet.png`. It also rebuilds the runner's legs into a proper 8-frame stride (the AI's 4 frames have the same foot in front every time, which looks like a limp). It removes the magenta background, finds
  every shape, ignores text labels, and writes the runner, obstacles and tiles at the right sizes. Add `--report` to see
  what it found without writing anything. The sheet must be a PNG in the layout from the art brief: a top row of 10
  runner frames (4 run, 2 air, 4 death) and a bottom row of 3 obstacles then 7 icons.
- **Placeholder art:** `npm run art` draws any image that is missing (it never overwrites existing files). Add `--force` to
  redraw everything, for example after changing a level's colours.
- To use a different file name for a level's background or tile, change `bg` / `tile` on that level in `js/config.js`.
