# Design notes — عقارات تونس

## Visual reference: Ludo game (requested 2026-11-23)

The user plays a Ludo game and wants this game to look and feel like it, in both:
- **Visuals:** colors, board styling, tokens, dice, buttons, overall polish.
- **Viewport:** how the game fits the screen (layout, board size, orientation, mobile vs desktop).

**Source:** the Ludo game on the Karta Club website (played in Brave). Screenshot received 2026-11-23
(4 players, 2576×1360 capture, i.e. about 1.9:1 landscape). Copy the look and feel only, never its
avatars, logo or art assets.

### Look (what to copy)
- **Mood:** dark, premium "game room" look. A wooden table with dim lamp light in the corner, and the
  board sitting on it like a physical object, slightly tilted toward the viewer (soft perspective).
- **Palette:** near-black green/charcoal UI, warm gold accents (borders, buttons, text highlights),
  muted jewel player colors: deep red, forest green, navy blue, antique gold.
- **Board:** dark wood frame with a thin metal/gold inlay. Home areas are leather-textured panels with a
  stitched border, a ring in the player color, and ornate gold corner flourishes. Track squares are
  grey stone tiles, with colored tiles for each player's home lane. Safe squares have a ring icon, and
  small chevron arrows mark each lane's entry.
- **Tokens:** glossy, weighty pawns in the player color with a gold base ring (not flat discs).
- **Dice:** a real 3D white die with black pips, in a recessed tray at the player's corner, with a
  circular countdown timer (e.g. "6s") and emoji and chat buttons below it. Roll by flicking the die.
- **Typography:** serif display font for titles ("Play in full screen"), clean sans for HUD text.
- **Buttons:** gold gradient, rounded, with a white inner outline; secondary buttons are small dark
  circles with gold line icons.

### Viewport and layout (what to copy)
- **The game fills the whole viewport edge to edge**, with no page chrome, scrollbars or side columns.
  Landscape wide (about 16:9), board scaled to cover the screen, and no separate sidebar.
- **Top bar:** one row of four player chips, each with avatar, name, "n/4 HOME" and SCORE. The active
  player is marked "PLAYING". Top-right shows ping and packet loss.
- **Corner player panels:** each player's name plate sits at their board corner (avatar + name). The
  local player's panel also shows "Your turn" and holds the dice tray.
- **Bottom-right controls:** players list, sound, fullscreen, and a red "Leave game" button.
- **Bottom center:** a small hint pill ("Your roll. Flick the die").
- **Fullscreen prompt:** a centered modal "Play in full screen" with a big gold "Enter full screen" button.
  The game keeps running behind it.

### Status: first pass built (2026-11-23)
Done in `index.html`, `style.css`, `ui.js`:
- Dark wooden table, gold-framed tilted board (`--tilt`), stone tiles, gold-ringed glossy pawns, stitched green leather centre with gold serif title (Amiri).
- Full-viewport layout: top bar of player chips (name, cash, property count, current player highlighted), left panel "my properties", right panel log, bottom-right dock (fullscreen, leave), connection pill (local / online + room code).
- Two white 3D-style dice in a recessed tray (pips drawn in CSS, flick-to-throw kept), gold/red/green buttons, dark gold-trimmed modals, fullscreen prompt on first game start.
- Narrow screens (under 1000px wide or tall/portrait): falls back to a stacked layout (top bar, board, panels below). Only written, not yet tested on a phone.
- Kept: every element id used by `net.js`, the online lobby, and the "skip disconnected player" button (now inside the player chip).

Not done yet: turn countdown ring, emoji/chat buttons, sound button, player avatars, ping/loss readout, dice in a corner tray (dice are still in the board centre), true 3D dice tumble.

### 3D scene (stage 1 built, 2026-11-23)
- `scene3d.js` (ES module) + `vendor/three.module.js`, `vendor/three.core.js` (Three.js 0.187, MIT, copied from npm; licence in `vendor/three.LICENSE`). The server whitelist in `server/index.js` was extended for these files.
- Scene: wooden table, framed board with gold inlay, stitched green leather centre, 40 tiles with Arabic labels drawn onto canvas textures, lathe-turned pawns with gold rings and an emoji sprite, houses and hotels as small meshes, key light + warm lamp + soft shadows, camera at 66 degrees looking down.
- The HTML HUD (title, turn, dice, buttons) floats over the felt in `#hudwrap`; panels, popups and the online lobby are unchanged. Tiles are clickable (raycast, opens the deed popup).
- Fallback: the flat CSS board is used when WebGL is unavailable, when the window is narrow/portrait, or when the page is opened from `file://` (module scripts need http).
- Everything is generated in code (no downloaded textures or models yet).
- Next stages: 3D dice with a tumble that lands on the server's result, richer materials (CC0 wood/leather/stone textures; ask the user before downloading), nicer houses/hotels, portrait/phone camera, token hop and capture effects.

### UX reference #2: web Monopoly video (2026-11-23, replaces the Ludo look for 3D mode)
Source: the user's screen recording "Screen Recording 2026-11-23 at 1.37.04 AM" of a web Monopoly game (3D board you can orbit, cartoon style).
Decision from the user: copy the UX (layout + interactions); 3D assets/the board centre can stay simple.
What the reference does, and what we built (3D mode only, `body.light`):
- Full-screen 3D table, orbit (drag), zoom (wheel), pan (right-drag). Done: OrbitControls, polar/zoom/pan limits, camera-reset button.
- Top-left stacked player pills (name, cards count, money). Done (`#hudplayers`).
- Top-centre turn pill ("Your turn / On: tile / state" + clock) and a floating "Your turn!" banner. Done (`#hudturn`, `#banner`; the clock shows game time, not a turn timer).
- Right: collapsible HISTORY panel. Done (`#hudside`, game log). CHAT panel: NOT built (needs server support).
- Bottom-centre dice pill: two dice, "Total n", "Roll dice" button, hint text. Done (`#hudwrap #center`); dice can still be flicked.
- Bottom-right red "Surrender" + brown "My cards". Done as "انسحاب" (leave game) and "أوراقي" (build/mortgage). A real Surrender (voluntary bankruptcy) is NOT built.
- Bottom-left minimap with owner colours and pawns. Done (`#minimap`).
- Parchment popups with a brown ribbon title (Buy property, Chance/Chest, Tax, Auction, Deed, My cards), property card on the left, big Buy/Skip buttons, a close x. Done. "Pay rent" confirmation popup NOT built (rent is charged immediately and shown in the history).
- Not built from the video: Trade button/flow, per-turn countdown, camera auto-follow, sound/settings, camera screenshot button.
Scene (`scene3d.js`): light studio table, thin printed board (Arabic tiles rotated per side like a real board, colour bands toward the centre), zellige pattern + red title banner in the centre, Chance/Chest decks, loose title deeds on the table, plastic houses/hotels, glossy pawns with name tags, two real dice that tumble while `G.rolling` and land on the server's result. Own design (no Hasbro art, logo or Mr. Monopoly).
3D mode needs http (module scripts + importmap); flat dark fallback remains for no WebGL, narrow/portrait windows, and file://.

### Camera follow mode (2026-11-23)
- Default ON: the camera glides to the active player's pawn and sits outside the board on that player's side, looking inward (bottom side = 0 deg, left = -90, top = -180, right = -270). When the pawn rounds a corner the camera swings 90 deg with it; at each new turn follow switches back on.
- Turned off by dragging the mouse on the scene (wheel zoom keeps follow on); the target button in the top-right toolbar toggles it; the camera button resets to the full-board view (and turns follow off).
- Tunables in `scene3d.js`: `FOLLOW_DIST`, `FOLLOW_POLAR`, the inward shift in `followStep`, smoothing `dt * 3.2`.
- Not built: remembering a manual zoom level across turns (distance blends to `FOLLOW_DIST` for ~1.6s at each follow start).

### Animated monster pawns (2026-11-23)
- Pawns are Quaternius "Ultimate Monsters" (CC0): Cat, Dog, Chicken, Ninja, Mushnub, Alien = players 1..6 (`MONSTERS` in `scene3d.js`; emojis in `data.js` TOKENS match). Files in `models/`, loader in `vendor/loaders/GLTFLoader.js`; credits in `CREDITS.md`; originals + notes in `../assets-incoming/`.
- Each stands on a base in the player's colour (the monster keeps its own colours) with a name tag; scaled to `MONSTER_H` (0.6 tile).
- Animations: Idle at rest, Walk while moving (2.4x), Jump on buying a property or passing GO, "No" when sent to Jail, Dance for the winner, Death on bankruptcy (then hidden). Idle pawns face outward (toward their player/camera); walking pawns face the direction of travel.
- Several pawns on one tile are laid out in a grid (max 3 per line, 2 lines) with staggered name tags.
- If a model fails to load, a plain lathe pawn in the player colour is shown instead.
- Not tested yet: winner Dance and bankruptcy Death visually, online rooms, phones. Unused clips available: Bite_Front, HitRecieve, Yes.

### How this maps to عقارات تونس (original plan)
- Keep our square Monopoly board, but dress it as the dark wooden table: wood frame, gold inlay, stone/leather tiles, gold-ringed pawns (camel, olive and the other tokens), same jewel palette for color groups.
- Move to a full-viewport layout: top bar with player chips (name, cash, properties), player plates at the corners, dice tray with turn timer, bottom-right controls (players, sound, fullscreen, leave).
- Add the fullscreen prompt on start. Keep RTL Arabic text.
- Open question: portrait/mobile support (the reference is landscape-only).

## Other decisions so far
- Board names follow the Tunisian edition (Ranim Jeux): 22 streets, 4 stations (Tunis, Sousse, Sfax, Gabès), STEG and SONEDE.
- Prices are the classic ones (the Tunisian edition is ×100; not applied yet).
- Special-space Arabic wording (Chance, Community Chest, taxes, Jail) is still our own; not verified against the Arabic board image.
- Trading between players and the Speed Die are not built yet.
