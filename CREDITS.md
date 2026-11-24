# Credits

- **Characters** (`models/Cat.glb`, `Mouse.glb`, `Bear.glb`, `Rabbit.glb`, `Pig.glb`, `Wolf.glb`) — original models made for this game in Blender from one shared body, rig and animation set; each animal is a variant (colours + ear/tail/snout settings) in `assets-incoming/blender/make_character.py`. The plain variants are kept in `tools/base/`; the models the game loads are built from them by `tools/make_<animal>.js` (coat patterns, snouts, whiskers, teeth, tufts...). Five more animals are built from those same variants: `Cow.glb` (from the pig), `Monkey.glb` (from the mouse), `Cheetah.glb` and `Lion.glb` (from the cat), `Panda.glb` (from the bear).
- **Unused characters** still in `models/*.gltf` (Dog, Chicken, Ninja, Mushnub, Alien) — "Ultimate Monsters" by Quaternius, CC0 (public domain). https://quaternius.com/packs/ultimatemonsters.html
- **3D engine** — three.js (MIT), with its OrbitControls, GLTFLoader, RoomEnvironment, RoundedBoxGeometry, BufferGeometryUtils and SkeletonUtils add-ons. See `vendor/three.LICENSE`.
- **Fonts** — Tajawal and Amiri (SIL Open Font License) via Google Fonts.
- **Scenery** (`models/scene/*.glb`) — "Mini Forest" by Kenney (www.kenney.nl), CC0 (public domain).
