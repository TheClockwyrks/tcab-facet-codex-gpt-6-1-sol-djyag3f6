import type { InitApi, RenderApi } from "@clockwyrks/simple-2d";
import {
  ParticleSimulator,
  type ParticleSystem,
} from "@clockwyrks/particle-runtime";
import * as C from "./constants";
import {
  cellX,
  cellY,
  targets,
  menuItems,
  type FacetState,
  type State,
  type GemState,
} from "./game";
export interface Assets {
  readonly images: Readonly<Record<string, ImageBitmap>>;
  readonly fx: Readonly<Record<string, ParticleSystem>>;
  readonly clear: readonly AudioBuffer[];
}
export async function loadAssets(api: InitApi<FacetState>): Promise<Assets> {
  const paths: string[] = ["frame", "brilliant", "star"];
  for (const kind of [...C.GEM_KINDS, "prism"])
    for (let s = 0; s <= C.MAX_STRAIN; s++) paths.push(`${kind}-${s}`);
  for (const kind of C.GEM_KINDS)
    for (let f = 0; f < 6; f++) paths.push(`break/${kind}/${f}`);
  for (let f = 0; f < 8; f++) {
    paths.push(`prism-turn/${f}`);
    for (let strain = 1; strain <= C.MAX_STRAIN; strain++)
      paths.push(`prism-turn/${f}-${strain}`);
  }
  const images = Object.fromEntries(
    await Promise.all(
      paths.map(async (p) => [p, await api.assets.loadImage(`gems/${p}.png`)]),
    ),
  );
  const fx = Object.fromEntries(
    await Promise.all(
      ["clear", "flawed", "cut", "aura"].map(async (p) => [
        p,
        JSON.parse(
          await (await api.assets.load(`fx/${p}/system.json`)).text(),
        ) as ParticleSystem,
      ]),
    ),
  );
  await Promise.all(
    Object.values(C.CUES).map((c) =>
      api.audio.load(c, `audio/${c === "clear" ? "shatter" : c}.wav`),
    ),
  );
  await Promise.all(
    Array.from({ length: C.MAX_MULTIPLIER }, (_, i) =>
      api.audio.load(`chain-${i + 1}`, `audio/chain-${i + 1}.wav`),
    ),
  );
  await Promise.all([
    api.audio.load("title-theme", "audio/title.wav"),
    api.audio.load("play-bed", "audio/play.wav"),
  ]);
  return { images, fx, clear: [] };
}
const ivory = "#eee4cd",
  gold = "#cdb788",
  dim = "#82949f";
function text(
  ctx: CanvasRenderingContext2D,
  value: string,
  x: number,
  y: number,
  size = 18,
  color = ivory,
  align: CanvasTextAlign = "left",
  serif = false,
) {
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.font = `${serif ? "" : "500 "}${size}px ${serif ? "Georgia" : '"Trebuchet MS", sans-serif'}`;
  ctx.fillText(value, x, y);
}
function rule(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  color = "#33414b",
) {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, 1);
}
function sprite(
  ctx: CanvasRenderingContext2D,
  s: State,
  g: GemState,
  x: number,
  y: number,
) {
  const art = s.assets?.images;
  if (!art) return;
  ctx.imageSmoothingEnabled = false;
  const key =
    g.cut === "prism"
      ? `prism-turn/${Math.floor(s.simTime * 7) % 8}${g.strain ? `-${g.strain}` : ""}`
      : `${g.kind}-${g.strain}`;
  ctx.drawImage(art[key], Math.round(x - 32), Math.round(y - 32));

  if (g.cut === "brilliant" || g.cut === "star")
    ctx.drawImage(art[g.cut], Math.round(x - 32), Math.round(y - 32));
}
// Reconstruct effects from their phase-local age. Rendering never carries a clock or mutates state.
function effect(
  ctx: CanvasRenderingContext2D,
  s: State,
  name: string,
  x: number,
  y: number,
  age: number,
  seed: number,
) {
  if (age < 0 || (name !== "aura" && age > 1) || !s.assets) return;
  const sim = new ParticleSimulator(
    structuredClone(s.assets.fx[name]) as ParticleSystem,
    { seed, maxParticles: 64 },
  );
  for (let t = 0; t < age; t += 1 / 60)
    sim.step(Math.min(1 / 60, age - t) * 1000);
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (const p of sim.capture()) {
    ctx.globalAlpha = p.opacity;
    ctx.fillStyle = `rgb(${p.color.map((c) => Math.round(c * 255)).join(",")})`;
    ctx.beginPath();
    ctx.arc(
      x + p.position[0],
      y - p.position[1],
      Math.max(0.1, p.size * 1.5),
      0,
      Math.PI * 2,
    );
    ctx.fill();
  }
  ctx.restore();
}
function button(
  ctx: CanvasRenderingContext2D,
  t: { x: number; y: number; w: number; h: number },
  label: string,
  active: boolean,
) {
  ctx.fillStyle = active ? "#cdb788" : "#14232e";
  ctx.fillRect(t.x, t.y, t.w, t.h);
  ctx.strokeStyle = active ? "#f5dfb2" : "#43505b";
  ctx.strokeRect(t.x + 0.5, t.y + 0.5, t.w - 1, t.h - 1);
  text(
    ctx,
    label,
    t.x + t.w / 2,
    t.y + t.h / 2 + 7,
    19,
    active ? "#15202a" : ivory,
    "center",
  );
  if (active)
    text(ctx, "›", t.x + t.w - 28, t.y + t.h / 2 + 8, 25, "#15202a", "center");
}
function board(ctx: CanvasRenderingContext2D, s: State) {
  if (!s.board.cells.length || !s.assets) return;
  ctx.drawImage(s.assets.images.frame, 336, 92);
  const shatterEnd = s.lastWaves * C.WAVE_SECONDS;
  const falling =
    s.phase === "resolving"
      ? Math.max(0, s.stepTimer - shatterEnd)
      : Math.min(1, s.simTime - (s.openingTime ?? -100));
  ctx.save();
  ctx.beginPath();
  ctx.rect(350, 107, 580, 578);
  ctx.clip();
  for (const g of s.board.cells) {
    let x = cellX(g.col),
      y = cellY(g.row);
    if (s.phase === "swapping" && s.motion) {
      const a = s.motion.a,
        b = s.motion.b;
      const i = g.row * C.GRID_COLS + g.col;
      const from =
        i === a.row * C.GRID_COLS + a.col
          ? b
          : i === b.row * C.GRID_COLS + b.col
            ? a
            : null;
      if (from) {
        const t = s.swapTimer / C.SWAP_SECONDS;
        x = cellX(from.col) + (x - cellX(from.col)) * t;
        y = cellY(from.row) + (y - cellY(from.row)) * t;
      }
    } else if (
      s.phase === "resolving" ||
      (s.openingTime !== undefined && s.simTime - s.openingTime < 0.5)
    ) {
      if (s.phase === "resolving" && s.stepTimer < shatterEnd) {
        if (
          g.row - g.fell < 0 ||
          s.created?.some((c) => c.col === g.col && c.row === g.row)
        )
          continue;
        sprite(ctx, s, g, x, y - g.fell * C.CELL_PITCH);
        continue;
      }
      const duration = g.fell * C.FALL_SECONDS_PER_ROW;
      const t = duration ? Math.min(1, falling / duration) : 1;
      y -= (1 - t * t) * g.fell * C.CELL_PITCH;
    }
    if (s.selection && s.offer && s.phase === "idle") {
      if (g.col === s.selection.col && g.row === s.selection.row) {
        x = cellX(s.offer.col);
        y = cellY(s.offer.row);
      } else if (g.col === s.offer.col && g.row === s.offer.row) {
        x = cellX(s.selection.col);
        y = cellY(s.selection.row);
      }
    }
    sprite(ctx, s, g, x, y);
    if (g.cut !== "plain")
      effect(
        ctx,
        s,
        "aura",
        x,
        y,
        1 + (s.simTime % 1),
        g.row * 19 + g.col * 117,
      );
  }
  if (s.phase === "resolving")
    for (const { gem, wave } of s.shards ?? []) {
      const age = s.stepTimer - wave * C.WAVE_SECONDS,
        x = cellX(gem.col),
        y = cellY(gem.row);
      if (age < 0) sprite(ctx, s, gem, x, y);
      else if (age < 0.24) {
        const kind = gem.kind;
        if (kind)
          ctx.drawImage(
            s.assets.images[
              `break/${kind}/${Math.min(5, Math.floor(age * 25))}`
            ],
            x - 32,
            y - 32,
          );
        effect(
          ctx,
          s,
          gem.strain === C.MAX_STRAIN ? "flawed" : "clear",
          x,
          y,
          age,
          gem.row * 43 + gem.col * 71,
        );
      }
    }
  if (s.phase === "resolving")
    for (const g of s.created ?? [])
      effect(
        ctx,
        s,
        "cut",
        cellX(g.col),
        cellY(g.row),
        s.stepTimer,
        g.col * 43 + g.row * 79,
      );
  ctx.restore();
  if (s.selection) {
    ctx.strokeStyle = "#fff2c7";
    ctx.lineWidth = 2;
    ctx.strokeRect(
      cellX(s.selection.col) - 34,
      cellY(s.selection.row) - 34,
      68,
      68,
    );
  }
  if (s.refusal) {
    ctx.strokeStyle = "#ff7c83";
    ctx.lineWidth = 3;
    for (const g of [s.refusal.a, s.refusal.b])
      ctx.strokeRect(cellX(g.col) - 32, cellY(g.row) - 32, 64, 64);
  }
}
function field(ctx: CanvasRenderingContext2D) {
  const glow = ctx.createRadialGradient(640, 350, 80, 640, 350, 720);
  glow.addColorStop(0, "#1b2b36");
  glow.addColorStop(1, "#090f17");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, C.STAGE_W, C.STAGE_H);
  ctx.strokeStyle = "#22313c";
  ctx.lineWidth = 1;
  for (const x of [40, 1240]) {
    ctx.beginPath();
    ctx.moveTo(x, 40);
    ctx.lineTo(x, 680);
    ctx.stroke();
  }
  rule(ctx, 40, 40, 1200);
  rule(ctx, 40, 680, 1200);
  text(ctx, "F / 01", 62, 68, 12, dim);
  text(ctx, "THE LAPIDARY COLLECTION", 1218, 68, 12, dim, "right");
}
function hud(ctx: CanvasRenderingContext2D, s: State) {
  text(ctx, C.TITLE_TEXT, 72, 142, 40, ivory, "left", true);
  text(ctx, "PRESSURE / POTENTIAL", 74, 169, 11, gold);
  rule(ctx, 74, 191, 210);
  text(ctx, C.HUD_SCORE_LABEL, 76, 234, 13, dim);
  text(ctx, s.score.toLocaleString(), 73, 277, 38, ivory);
  text(ctx, C.HUD_LEVEL_LABEL, 76, 326, 13, dim);
  text(ctx, String(s.level).padStart(2, "0"), 74, 369, 38, ivory);
  text(ctx, "LEVEL PROGRESS", 76, 421, 12, dim);
  ctx.fillStyle = "#253744";
  ctx.fillRect(76, 441, 207, 6);
  ctx.fillStyle = gold;
  ctx.fillRect(
    76,
    441,
    207 * Math.min(1, s.levelScore / (s.level * C.LEVEL_TARGET_STEP)),
    6,
  );
  text(
    ctx,
    `${s.levelScore} / ${s.level * C.LEVEL_TARGET_STEP}`,
    76,
    474,
    14,
    gold,
  );
  if (s.phase === "resolving") {
    text(ctx, C.HUD_CHAIN_LABEL, 1010, 206, 13, gold);
    text(
      ctx,
      `×${Math.min(s.chainStep, C.MAX_MULTIPLIER)}`,
      1007,
      262,
      54,
      ivory,
    );
    text(ctx, `+${s.lastPoints}`, 1010, 301, 24, gold);
    text(ctx, `${s.lastCleared} STONES`, 1010, 329, 12, dim);
  }
  text(ctx, "MAKE A LINE.", 1010, 447, 13, gold);
  text(ctx, "LEAVE A FLAW.", 1010, 471, 13, gold);
  rule(ctx, 1010, 490, 185);
  text(ctx, "Match 3 to shatter.", 1010, 521, 14, dim);
  text(ctx, "Cracks build pressure.", 1010, 546, 14, dim);
  text(ctx, "Flawed stones pay double.", 1010, 571, 14, dim);
  text(ctx, s.muted ? "M  /  SOUND OFF" : "M  /  SOUND ON", 76, 640, 12, dim);
  text(
    ctx,
    "DRAG OR TAP NEIGHBORS · RELEASE TO SWAP",
    640,
    716,
    11,
    dim,
    "center",
  );
}
const instructions = [
  [
    "01   TAKE HOLD",
    "Drag a gem onto its neighbor, then release. Or tap one, then its neighbor.",
    "Bring it back before releasing to cancel. Mouse, pen, and finger all work.",
  ],
  [
    "02   BREAK A LINE",
    "Three or more of the same kind shatter. A move that clears nothing is refused.",
    "Neighbors gain strain. After three cracks, a stone is flawed: it joins nearby clears for double points.",
  ],
  [
    "03   EARN A CUT",
    "Four in a line leave a brilliant, clearing its surrounding ring. Five leave a prism.",
    "Crossing lines leave a star, clearing its row and column. Swap a prism to clear every gem of a kind.",
  ],
  [
    "04   FIND THE CHAIN",
    "Falling stones can match again. Each chain step raises the multiplier, up to ×8.",
    "Reach the level target to continue. Your round ends when no productive move remains.",
  ],
];
export function renderScene(s: State, api: RenderApi): void {
  const ctx = api.ctx;
  ctx.save();
  field(ctx);
  if (
    s.screen === "playing" ||
    s.screen === "paused" ||
    s.screen === "levelclear" ||
    s.screen === "gameover"
  ) {
    board(ctx, s);
    hud(ctx, s);
  }
  if (s.screen === "playing") {
    for (const t of targets(s)) button(ctx, t, C.PAUSE_LABEL, false);
  } else if (s.screen === "howto") {
    text(ctx, "THE ART OF PRESSURE", 88, 133, 44, ivory, "left", true);
    text(ctx, "A small guide to a good fracture.", 90, 166, 17, dim);
    instructions.forEach(([heading, a, b], i) => {
      const y = 222 + i * 88;
      text(ctx, heading, 90, y, 14, gold);
      text(ctx, a, 90, y + 25, 17);
      text(ctx, b, 90, y + 49, 15, dim);
    });
    text(
      ctx,
      "↑ ↓  menus     ENTER / SPACE  choose     P / ESC  pause     M  mute     ESC  back",
      90,
      651,
      15,
      gold,
    );
    button(ctx, targets(s)[0], C.BACK_LABEL, false);
  } else {
    if (s.screen !== "title") {
      ctx.fillStyle = "#081019dc";
      ctx.fillRect(0, 0, C.STAGE_W, C.STAGE_H);
    } else {
      // A specimen arrangement, separate from the playable board.
      const display: GemState = {
        col: 0,
        row: 0,
        kind: "beryl",
        cut: "plain",
        strain: 0,
        fell: 0,
      };
      ctx.save();
      ctx.translate(640, 190);
      ctx.scale(2.6, 2.6);
      sprite(ctx, s, display, 0, 0);
      ctx.restore();
      text(ctx, "A GAME OF STONES & CONSEQUENCES", 640, 88, 12, gold, "center");
    }
    const heading =
      s.screen === "title"
        ? C.TITLE_TEXT
        : s.screen === "paused"
          ? C.PAUSED_TITLE_TEXT
          : s.screen === "levelclear"
            ? C.LEVELCLEAR_TITLE_TEXT
            : C.GAMEOVER_TITLE_TEXT;
    text(
      ctx,
      heading,
      640,
      s.screen === "title" ? 340 : 274,
      s.screen === "title" ? 88 : 52,
      ivory,
      "center",
      true,
    );
    text(
      ctx,
      s.screen === "title"
        ? C.TAGLINE_TEXT
        : s.screen === "paused"
          ? "THE PRESSURE CAN WAIT."
          : s.screen === "levelclear"
            ? `${C.HUD_LEVEL_LABEL} ${s.level}  /  ${C.BEST_CHAIN_LABEL} ${s.bestChain}  /  ${C.BEST_MOVE_LABEL} ${s.bestMove}`
            : `${C.HUD_SCORE_LABEL} ${s.score}  /  ${C.HUD_LEVEL_LABEL} ${s.level}`,
      640,
      s.screen === "title" ? 382 : 325,
      14,
      gold,
      "center",
    );
    const items = menuItems(s.screen);
    targets(s).forEach((t, i) => button(ctx, t, items[i], s.menuIndex === i));
    text(
      ctx,
      "↑ ↓  SELECT     ↵  CONFIRM     M  SOUND",
      640,
      638,
      12,
      dim,
      "center",
    );
  }
  ctx.restore();
}
