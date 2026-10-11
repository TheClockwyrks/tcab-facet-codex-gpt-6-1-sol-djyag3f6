import type { Game } from "@clockwyrks/simple-2d";
import type { DeepReadonly } from "ts-essentials";
import * as C from "./constants";
export type GemKind =
  "ruby" | "amber" | "citrine" | "jade" | "beryl" | "sapphire" | "amethyst";

export type Cut = "plain" | "brilliant" | "star" | "prism";

export type Screen =
  "title" | "howto" | "playing" | "paused" | "levelclear" | "gameover";

export type Phase = "idle" | "swapping" | "resolving";

export type PointerDevice = "mouse" | "pen" | "touch";

export interface CellRef {
  readonly col: number;
  readonly row: number;
}

export interface GemState {
  readonly col: number;
  readonly row: number;
  readonly kind: GemKind | null;
  readonly cut: Cut;
  readonly strain: number;
  readonly fell: number;
}

export interface BoardState {
  readonly cols: number;
  readonly rows: number;
  readonly cells: readonly GemState[];
}

export interface RefusalState {
  readonly a: CellRef;
  readonly b: CellRef;
  readonly timer: number;
}

export interface PointerState {
  readonly x: number;
  readonly y: number;
  readonly down: boolean;
  readonly device: PointerDevice;
}

export interface FacetState {
  readonly assets?: DeepReadonly<Assets>;
  readonly motion?: Motion;
  readonly shards?: readonly Shard[];
  readonly created?: readonly CellRef[];
  readonly openingTime?: number;
  readonly screen: Screen;
  readonly menuIndex: number;

  readonly board: BoardState;
  readonly phase: Phase;
  readonly chainStep: number;
  readonly swapTimer: number;
  readonly stepTimer: number;

  readonly score: number;
  readonly level: number;
  readonly levelScore: number;
  readonly lastCleared: number;
  readonly lastPoints: number;
  readonly lastWaves: number;

  readonly moveScore: number;
  readonly bestMove: number;
  readonly bestChain: number;

  readonly selection: CellRef | null;
  readonly offer: CellRef | null;
  readonly refusal: RefusalState | null;
  readonly armedTarget: string | null;

  readonly pointer: PointerState;
  readonly simTime: number;
  readonly muted: boolean;
  readonly refillKinds: readonly string[];
}

export const BACKGROUND = "#0b141d";
export type State = DeepReadonly<FacetState>;
export const cellX = (col: number) =>
  C.BOARD_CX - ((C.GRID_COLS - 1) * C.CELL_PITCH) / 2 + col * C.CELL_PITCH;
export const cellY = (row: number) =>
  C.BOARD_CY - ((C.GRID_ROWS - 1) * C.CELL_PITCH) / 2 + row * C.CELL_PITCH;
const letters = "RACJBSM";
const empty = (): BoardState => ({ cols: 0, rows: 0, cells: [] });
export function initial(): FacetState {
  return {
    screen: "title",
    menuIndex: 0,
    board: empty(),
    phase: "idle",
    chainStep: 0,
    swapTimer: 0,
    stepTimer: 0,
    score: 0,
    level: 1,
    levelScore: 0,
    lastCleared: 0,
    lastPoints: 0,
    lastWaves: 0,
    moveScore: 0,
    bestMove: 0,
    bestChain: 0,
    selection: null,
    offer: null,
    refusal: null,
    armedTarget: null,
    pointer: { x: 0, y: 0, down: false, device: "mouse" },
    simTime: 0,
    muted: false,
    refillKinds: Array.from({ length: C.GRID_COLS }, () => ""),
  };
}
const idx = (c: CellRef) => c.row * C.GRID_COLS + c.col;
const ref = (i: number): CellRef => ({
  col: i % C.GRID_COLS,
  row: Math.floor(i / C.GRID_COLS),
});
const adjacent = (a: CellRef, b: CellRef) =>
  Math.abs(a.col - b.col) + Math.abs(a.row - b.row) === 1;
function validateCell(col: number, row: number) {
  if (
    !Number.isInteger(col) ||
    !Number.isInteger(row) ||
    col < 0 ||
    row < 0 ||
    col >= C.GRID_COLS ||
    row >= C.GRID_ROWS
  )
    throw new RangeError("Invalid cell");
}
function integer(n: number, min = 0) {
  if (!Number.isInteger(n) || n < min) throw new RangeError("Invalid integer");
}
function parse(token: string, col: number, row: number): GemState {
  if (!/^(?:[RACJBSM][0-3][bs]?|X[0-3])$/.test(token))
    throw new Error("Invalid gem token");
  return {
    col,
    row,
    kind: token[0] === "X" ? null : C.GEM_KINDS[letters.indexOf(token[0])],
    strain: Number(token[1]),
    cut:
      token[0] === "X"
        ? "prism"
        : token[2] === "b"
          ? "brilliant"
          : token[2] === "s"
            ? "star"
            : "plain",
    fell: 0,
  };
}
interface Run {
  cells: number[];
  kind: GemKind;
  axis: number;
}
export function runs(board: DeepReadonly<BoardState>): Run[] {
  const result: Run[] = [];
  for (const axis of [0, 1])
    for (let line = 0; line < C.GRID_ROWS; line++) {
      let start = 0;
      while (start < C.GRID_COLS) {
        const at = (n: number) =>
          axis ? n * C.GRID_COLS + line : line * C.GRID_COLS + n;
        const kind = board.cells[at(start)]?.kind;
        let end = start + 1;
        while (end < C.GRID_COLS && kind && board.cells[at(end)]?.kind === kind)
          end++;
        if (kind && end - start >= C.MATCH_MIN)
          result.push({
            cells: Array.from({ length: end - start }, (_, n) => at(start + n)),
            kind,
            axis,
          });
        start = end;
      }
    }
  return result;
}
function exchanged(
  board: DeepReadonly<BoardState>,
  a: CellRef,
  b: CellRef,
): BoardState {
  const cells = board.cells.map((g) => ({ ...g }));
  const ga = cells[idx(a)],
    gb = cells[idx(b)];
  if (!ga || !gb) throw new Error("No gem at cell");
  cells[idx(a)] = { ...gb, ...a, fell: 0 };
  cells[idx(b)] = { ...ga, ...b, fell: 0 };
  return { ...board, cells };
}
function productive(board: DeepReadonly<BoardState>, a: CellRef, b: CellRef) {
  return (
    board.cells[idx(a)]?.cut === "prism" ||
    board.cells[idx(b)]?.cut === "prism" ||
    runs(exchanged(board, a, b)).length > 0
  );
}
export function legalSwap(board: DeepReadonly<BoardState>): boolean {
  if (board.cells.length !== C.GRID_COLS * C.GRID_ROWS) return false;
  for (const g of board.cells)
    for (const b of [
      { col: g.col + 1, row: g.row },
      { col: g.col, row: g.row + 1 },
    ])
      if (b.col < C.GRID_COLS && b.row < C.GRID_ROWS && productive(board, g, b))
        return true;
  return false;
}
function randomKind(): GemKind {
  return C.GEM_KINDS[Math.floor(Math.random() * C.GEM_KIND_COUNT)];
}
export function deal(): BoardState {
  for (;;) {
    const cells: GemState[] = [];
    for (let row = 0; row < C.GRID_ROWS; row++)
      for (let col = 0; col < C.GRID_COLS; col++) {
        let kind = randomKind();
        while (
          (col > 1 &&
            cells[cells.length - 1].kind === kind &&
            cells[cells.length - 2].kind === kind) ||
          (row > 1 &&
            cells[(row - 1) * C.GRID_COLS + col].kind === kind &&
            cells[(row - 2) * C.GRID_COLS + col].kind === kind)
        )
          kind = randomKind();
        cells.push({ col, row, kind, cut: "plain", strain: 0, fell: row + 1 });
      }
    const board = { cols: C.GRID_COLS, rows: C.GRID_ROWS, cells };
    if (legalSwap(board)) return board;
  }
}
// Presentation records describe the transaction represented by the current phase.
export interface Motion {
  readonly a: CellRef;
  readonly b: CellRef;
  readonly prismKind: GemKind | null | undefined;
  readonly bothPrisms: boolean;
}
export interface Shard {
  readonly gem: GemState;
  readonly wave: number;
}
export function requestSwap(
  s: State,
  colA: number,
  rowA: number,
  colB: number,
  rowB: number,
): FacetState {
  validateCell(colA, rowA);
  validateCell(colB, rowB);
  const a = { col: colA, row: rowA },
    b = { col: colB, row: rowB };
  if (!s.board.cells[idx(a)] || !s.board.cells[idx(b)])
    throw new Error("No board in play");
  if (s.phase !== "idle" || !adjacent(a, b) || !productive(s.board, a, b))
    return { ...s, refusal: { a, b, timer: 0 } };
  const ga = s.board.cells[idx(a)],
    gb = s.board.cells[idx(b)];
  return {
    ...s,
    board: exchanged(s.board, a, b),
    phase: "swapping",
    swapTimer: 0,
    chainStep: 0,
    moveScore: 0,
    motion: {
      a,
      b,
      prismKind:
        ga.cut === "prism" ? gb.kind : gb.cut === "prism" ? ga.kind : undefined,
      bothPrisms: ga.cut === "prism" && gb.cut === "prism",
    },
  };
}
const neighbors = (i: number, diagonal = false) => {
  const a = ref(i),
    result: number[] = [];
  for (let dy = -1; dy <= 1; dy++)
    for (let dx = -1; dx <= 1; dx++)
      if ((dx || dy) && (diagonal || Math.abs(dx) + Math.abs(dy) === 1)) {
        const col = a.col + dx,
          row = a.row + dy;
        if (col >= 0 && col < C.GRID_COLS && row >= 0 && row < C.GRID_ROWS)
          result.push(idx({ col, row }));
      }
  return result;
};
export function resolve(
  s: State,
  emit?: (cue: string, step: number) => void,
): FacetState {
  const found =
    s.chainStep === 1 && s.motion?.prismKind !== undefined ? [] : runs(s.board);
  const waves = new Map<number, number>();
  for (const run of found) for (const i of run.cells) waves.set(i, 0);
  if (s.chainStep === 1 && s.motion?.prismKind !== undefined)
    for (const [i, g] of s.board.cells.entries())
      if (
        s.motion.bothPrisms ||
        g.kind === s.motion.prismKind ||
        (g.cut === "prism" && (i === idx(s.motion.a) || i === idx(s.motion.b)))
      )
        waves.set(i, 0);
  const queue = [...waves.keys()];
  for (let q = 0; q < queue.length; q++) {
    const i = queue[q],
      g = s.board.cells[i],
      w = waves.get(i)!;
    let additions = neighbors(i).filter(
      (n) => s.board.cells[n].strain === C.MAX_STRAIN,
    );
    if (g.cut === "brilliant") additions = additions.concat(neighbors(i, true));
    if (g.cut === "star")
      additions = additions.concat(
        s.board.cells.flatMap((v, n) =>
          v.col === g.col || v.row === g.row ? [n] : [],
        ),
      );
    for (const n of additions)
      if (!waves.has(n)) {
        waves.set(n, w + 1);
        queue.push(n);
      }
  }
  const multiplier = Math.min(s.chainStep, C.MAX_MULTIPLIER);
  const points = queue.reduce(
    (sum, i) =>
      sum +
      (s.board.cells[i].strain === C.MAX_STRAIN
        ? C.FLAWED_SCORE
        : C.BASE_SCORE) *
        multiplier,
    0,
  );
  const creations = new Map<number, GemState>();
  const priority = { plain: 0, brilliant: 1, star: 2, prism: 3 };
  function create(i: number, cut: Cut, kind: GemKind) {
    if (priority[cut] > priority[creations.get(i)?.cut ?? "plain"])
      creations.set(i, {
        ...ref(i),
        kind: cut === "prism" ? null : kind,
        cut,
        strain: 0,
        fell: 0,
      });
  }
  for (const run of found) {
    if (run.cells.length >= 4) {
      const swapped = s.motion ? [idx(s.motion.a), idx(s.motion.b)] : [];
      const i =
        run.cells.find((n) => swapped.includes(n)) ??
        run.cells[Math.floor((run.cells.length - 1) / 2)];
      create(i, run.cells.length >= 5 ? "prism" : "brilliant", run.kind);
    }
    for (const other of found)
      if (other.axis !== run.axis)
        for (const i of run.cells)
          if (other.cells.includes(i)) create(i, "star", run.kind);
  }
  emit?.(C.CUES.clear, s.chainStep);
  if (creations.size) emit?.(C.CUES.cut, s.chainStep);
  if (
    s.board.cells.some(
      (g, i) =>
        !waves.has(i) &&
        g.strain === C.MAX_STRAIN - 1 &&
        neighbors(i).some((n) => waves.has(n)),
    )
  )
    emit?.(C.CUES.flaw, s.chainStep);
  const createdPositions: CellRef[] = [];
  const cells: GemState[] = Array.from({ length: C.GRID_COLS * C.GRID_ROWS });
  for (let col = 0; col < C.GRID_COLS; col++) {
    const survivors: GemState[] = [];
    for (let row = 0; row < C.GRID_ROWS; row++) {
      const i = idx({ col, row }),
        g = s.board.cells[i];
      if (creations.has(i)) survivors.push(creations.get(i)!);
      else if (!waves.has(i))
        survivors.push({
          ...g,
          strain: Math.min(
            C.MAX_STRAIN,
            g.strain + (neighbors(i).some((n) => waves.has(n)) ? 1 : 0),
          ),
        });
    }
    const missing = C.GRID_ROWS - survivors.length;
    for (let row = 0; row < C.GRID_ROWS; row++) {
      if (row < missing) {
        const letter = s.refillKinds[col]?.[row];
        cells[idx({ col, row })] = {
          col,
          row,
          kind: letter ? C.GEM_KINDS[letters.indexOf(letter)] : randomKind(),
          cut: "plain",
          strain: 0,
          fell: missing,
        };
      } else {
        const g = survivors[row - missing];
        if (creations.get(idx(g)) === g) createdPositions.push({ col, row });
        cells[idx({ col, row })] = { ...g, row, fell: row - g.row };
      }
    }
  }
  return {
    ...s,
    board: { ...s.board, cells },
    lastCleared: queue.length,
    lastPoints: points,
    lastWaves: Math.max(0, ...waves.values()),
    score: s.score + points,
    levelScore: s.levelScore + points,
    moveScore: s.moveScore + points,
    bestChain: Math.max(s.bestChain, s.chainStep),
    stepTimer: 0,
    shards: queue.map((i) => ({
      gem: { ...s.board.cells[i] },
      wave: waves.get(i)!,
    })),
    created: createdPositions,
  };
}
export const lastFall = (s: State) =>
  Math.max(0, ...s.board.cells.map((g) => g.fell));
export const stepHold = (s: State) =>
  s.lastWaves * C.WAVE_SECONDS +
  lastFall(s) * C.FALL_SECONDS_PER_ROW +
  C.STEP_SECONDS;
export function advance(
  s: State,
  dt: number,
  emit?: (cue: string, step: number) => void,
): FacetState {
  let next: FacetState = { ...s, simTime: s.simTime + dt };
  if (s.screen !== "playing") return next;
  if (s.refusal)
    next = {
      ...next,
      refusal:
        s.refusal.timer + dt >= C.REFUSAL_SECONDS
          ? null
          : { ...s.refusal, timer: s.refusal.timer + dt },
    };
  let remaining = dt;
  while (remaining > 0 && next.screen === "playing" && next.phase !== "idle") {
    const swapping = next.phase === "swapping",
      timer = swapping ? next.swapTimer : next.stepTimer,
      limit = swapping ? C.SWAP_SECONDS : stepHold(next),
      used = Math.min(remaining, Math.max(0, limit - timer));
    remaining -= used;
    const landAt =
      next.lastWaves * C.WAVE_SECONDS + lastFall(next) * C.FALL_SECONDS_PER_ROW;
    if (
      !swapping &&
      lastFall(next) > C.LAND_MIN_ROWS &&
      timer < landAt &&
      timer + used >= landAt
    )
      emit?.(C.CUES.land, next.chainStep);
    next = swapping
      ? { ...next, swapTimer: timer + used }
      : { ...next, stepTimer: timer + used };
    if (timer + used + 1e-10 < limit) break;
    if (swapping)
      next = resolve(
        {
          ...next,
          phase: "resolving",
          swapTimer: 0,
          chainStep: 1,
        },
        emit,
      );
    else if (runs(next.board).length)
      next = resolve(
        { ...next, chainStep: next.chainStep + 1, stepTimer: 0 },
        emit,
      );
    else {
      next = {
        ...next,
        phase: "idle",
        chainStep: 0,
        stepTimer: 0,
        bestMove: Math.max(next.bestMove, next.moveScore),
      };
      if (next.levelScore >= C.LEVEL_TARGET_STEP * next.level)
        next = {
          ...next,
          screen: "levelclear",
          menuIndex: 0,
          armedTarget: null,
        };
      else if (!legalSwap(next.board))
        next = { ...next, screen: "gameover", menuIndex: 0, armedTarget: null };
    }
  }
  return next;
}
export interface Target {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
}
export function menuItems(screen: Screen): readonly string[] {
  return screen === "title"
    ? C.TITLE_ITEMS
    : screen === "paused"
      ? C.PAUSED_ITEMS
      : screen === "levelclear"
        ? C.LEVELCLEAR_ITEMS
        : screen === "gameover"
          ? C.GAMEOVER_ITEMS
          : [];
}
export function targets(s: State): Target[] {
  if (s.screen === "playing")
    return [{ id: "pause", x: 1050, y: 24, w: 150, h: C.TARGET_MIN_H }];
  if (s.screen === "howto")
    return [{ id: "back", x: 1040, y: 612, w: 160, h: C.TARGET_MIN_H }];
  return menuItems(s.screen).map((_, i) => ({
    id: `menu-${i}`,
    x: 480,
    y: 430 + i * 88,
    w: 320,
    h: C.TARGET_MIN_H,
  }));
}
function show(s: State, screen: Screen, menuIndex = 0): FacetState {
  return { ...s, screen, menuIndex, armedTarget: null };
}
function quit(s: State): FacetState {
  return {
    ...show(s, "title"),
    board: empty(),
    phase: "idle",
    chainStep: 0,
    swapTimer: 0,
    stepTimer: 0,
    selection: null,
    offer: null,
    refusal: null,
    motion: undefined,
    shards: undefined,
    created: undefined,
  };
}
function start(s: State): FacetState {
  return {
    ...initial(),
    muted: s.muted,
    assets: s.assets,
    simTime: s.simTime,
    pointer: s.pointer,
    screen: "playing",
    board: deal(),
    openingTime: s.simTime,
  };
}
export function confirm(s: State): FacetState {
  if (s.screen === "title")
    return s.menuIndex === 0 ? start(s) : show(s, "howto");
  if (s.screen === "paused")
    return s.menuIndex === 0 ? show(s, "playing") : quit(s);
  if (s.screen === "gameover") return s.menuIndex === 0 ? start(s) : quit(s);
  if (s.screen === "levelclear")
    return s.menuIndex === 0
      ? {
          ...show(s, "playing"),
          level: s.level + 1,
          levelScore: 0,
          bestMove: 0,
          bestChain: 0,
          board: deal(),
          openingTime: s.simTime,
          selection: null,
          offer: null,
        }
      : quit(s);
  return { ...s };
}
function back(s: State): FacetState {
  return s.screen === "howto"
    ? show(s, "title", 1)
    : s.screen === "gameover"
      ? show(s, "title")
      : { ...s };
}
function pause(s: State): FacetState {
  return s.screen === "playing"
    ? show(s, "paused")
    : s.screen === "paused"
      ? show(s, "playing")
      : { ...s };
}
function hit(s: State, x: number, y: number) {
  return targets(s).find(
    (t) => x >= t.x && x <= t.x + t.w && y >= t.y && y <= t.y + t.h,
  );
}
function cellHit(s: State, x: number, y: number) {
  return s.board.cells.find(
    (g) => Math.hypot(x - cellX(g.col), y - cellY(g.row)) <= C.GEM_HIT_R,
  );
}
export function pointer(
  s: State,
  type: "down" | "move" | "up",
  x: number,
  y: number,
  device: PointerDevice = "mouse",
): FacetState {
  if (
    !Number.isFinite(x) ||
    !Number.isFinite(y) ||
    !["mouse", "pen", "touch"].includes(device)
  )
    throw new Error("Invalid pointer");
  let next: FacetState = {
    ...s,
    pointer: {
      x,
      y,
      device,
      down: type === "down" ? true : type === "up" ? false : s.pointer.down,
    },
  };
  const t = hit(s, x, y);
  if (t?.id.startsWith("menu-") && (type === "down" || !s.pointer.down))
    next = { ...next, menuIndex: Number(t.id.slice(5)) };
  if (type === "down") {
    next = { ...next, armedTarget: t?.id ?? null };
    if (!t && s.screen === "playing") {
      const c = cellHit(s, x, y);
      if (!c) next = { ...next, selection: null, offer: null };
      else if (s.selection && adjacent(s.selection, c))
        next = { ...next, offer: { col: c.col, row: c.row } };
      else
        next = { ...next, selection: { col: c.col, row: c.row }, offer: null };
    }
  } else if (
    type === "move" &&
    s.pointer.down &&
    !s.armedTarget &&
    s.screen === "playing" &&
    s.selection
  ) {
    const c = cellHit(s, x, y);
    if (c && idx(c) === idx(s.selection)) next = { ...next, offer: null };
    else if (c && adjacent(c, s.selection))
      next = { ...next, offer: { col: c.col, row: c.row } };
  } else if (type === "up") {
    next = { ...next, armedTarget: null };
    if (s.armedTarget && t?.id === s.armedTarget) {
      next =
        t.id === "pause"
          ? pause(next)
          : t.id === "back"
            ? back(next)
            : confirm({ ...next, menuIndex: Number(t.id.slice(5)) });
    } else if (
      !s.armedTarget &&
      s.screen === "playing" &&
      s.selection &&
      s.offer
    )
      next = {
        ...requestSwap(
          next,
          s.selection.col,
          s.selection.row,
          s.offer.col,
          s.offer.row,
        ),
        selection: null,
        offer: null,
      };
  }
  return next;
}
export function snapshot(s: State) {
  return {
    version: C.FACET_DEBUG_VERSION,
    screen: s.screen,
    menuIndex: s.menuIndex,
    score: s.score,
    level: s.level,
    levelScore: s.levelScore,
    levelTarget: C.LEVEL_TARGET_STEP * s.level,
    phase: s.phase,
    chainStep: s.chainStep,
    multiplier: Math.min(s.chainStep, C.MAX_MULTIPLIER),
    swapTimer: s.swapTimer,
    stepTimer: s.stepTimer,
    stepHold: stepHold(s),
    board: {
      ...s.board,
      cells: s.board.cells.map((g) => ({
        ...g,
        x: cellX(g.col),
        y: cellY(g.row),
      })),
    },
    selection: s.selection,
    offer: s.offer,
    refusal: s.refusal ? { a: s.refusal.a, b: s.refusal.b } : null,
    lastCleared: s.lastCleared,
    lastPoints: s.lastPoints,
    lastWaves: s.lastWaves,
    lastFall: lastFall(s),
    moveScore: s.moveScore,
    bestMove: s.bestMove,
    bestChain: s.bestChain,
    legalSwap: legalSwap(s.board),
    refillKinds: [...s.refillKinds],
    pointer: { ...s.pointer },
    armedTarget: s.armedTarget,
    targets: targets(s),
    muted: s.muted,
    simTime: s.simTime,
  };
}
const debug = {
  version: C.FACET_DEBUG_VERSION,
  reset: (s: State): FacetState => ({
    ...initial(),
    muted: s.muted,
    assets: s.assets,
  }),
  reconcile: (s: State): FacetState => ({ ...s }),
  snapshot,
  setScreen(s: State, screen: Screen): FacetState {
    if (
      ![
        "title",
        "howto",
        "playing",
        "paused",
        "levelclear",
        "gameover",
      ].includes(screen)
    )
      throw new Error("Invalid screen");
    return { ...s, screen };
  },
  setMenuIndex(s: State, index: number): FacetState {
    integer(index);
    return { ...s, menuIndex: index };
  },
  loadBoard(s: State, rows: readonly string[]): FacetState {
    if (rows.length !== C.GRID_ROWS) throw new Error("Invalid rows");
    return {
      ...s,
      board: {
        cols: C.GRID_COLS,
        rows: C.GRID_ROWS,
        cells: rows.flatMap((line, row) => {
          const tokens = line.trim().split(/\s+/);
          if (tokens.length !== C.GRID_COLS) throw new Error("Invalid columns");
          return tokens.map((t, col) => parse(t, col, row));
        }),
      },
    };
  },
  dealBoard: (s: State): FacetState => ({ ...s, board: deal() }),
  clearBoard: (s: State): FacetState => ({ ...s, board: empty() }),
  setGem(s: State, col: number, row: number, token: string): FacetState {
    validateCell(col, row);
    if (!s.board.cells[idx({ col, row })]) throw new Error("No board");
    return {
      ...s,
      board: {
        ...s.board,
        cells: s.board.cells.map((g) =>
          g.col === col && g.row === row ? parse(token, col, row) : g,
        ),
      },
    };
  },
  setRefillKinds(s: State, col: number, kinds: string): FacetState {
    validateCell(col, 0);
    if (!/^[RACJBSM]*$/.test(kinds)) throw new Error("Invalid refill");
    return {
      ...s,
      refillKinds: s.refillKinds.map((v, i) => (i === col ? kinds : v)),
    };
  },
  clearRefillKinds: (s: State): FacetState => ({
    ...s,
    refillKinds: initial().refillKinds,
  }),
  setScore(s: State, points: number): FacetState {
    integer(points);
    return { ...s, score: points };
  },
  setLevel(s: State, level: number): FacetState {
    integer(level, 1);
    return { ...s, level };
  },
  setLevelScore(s: State, points: number): FacetState {
    integer(points);
    return { ...s, levelScore: points };
  },
  setBestChain(s: State, chainStep: number): FacetState {
    integer(chainStep);
    return { ...s, bestChain: chainStep };
  },
  setBestMove(s: State, points: number): FacetState {
    integer(points);
    return { ...s, bestMove: points };
  },
  setMoveScore(s: State, points: number): FacetState {
    integer(points);
    return { ...s, moveScore: points };
  },
  setSelection(s: State, col: number, row: number): FacetState {
    validateCell(col, row);
    return { ...s, selection: { col, row } };
  },
  clearSelection: (s: State): FacetState => ({ ...s, selection: null }),
  setOffer(s: State, col: number, row: number): FacetState {
    validateCell(col, row);
    return { ...s, offer: { col, row } };
  },
  clearOffer: (s: State): FacetState => ({ ...s, offer: null }),
  clearRefusal: (s: State): FacetState => ({ ...s, refusal: null }),
  clearChain: (s: State): FacetState => ({
    ...s,
    phase: "idle",
    chainStep: 0,
    swapTimer: 0,
    stepTimer: 0,
  }),
  requestSwap,
  pointerDown: (
    s: State,
    x: number,
    y: number,
    device: PointerDevice = "mouse",
  ) => pointer(s, "down", x, y, device),
  pointerMove: (
    s: State,
    x: number,
    y: number,
    device: PointerDevice = "mouse",
  ) => pointer(s, "move", x, y, device),
  pointerUp: (s: State, device: PointerDevice = "mouse") =>
    pointer(s, "up", s.pointer.x, s.pointer.y, device),
};
export type FacetDebugApi = typeof debug;
import { loadAssets, renderScene } from "./presentation";
import type { Assets } from "./presentation";
export const game: Game<FacetState, FacetDebugApi> = {
  async initialize(api) {
    for (const action of C.ACTIONS)
      api.input.register(action, { keys: [...C.BINDINGS[action]] });
    const assets = await loadAssets(api);
    for (const key of [
      "screen",
      "phase",
      "score",
      "level",
      "levelScore",
      "chainStep",
      "lastCleared",
      "lastPoints",
      "lastWaves",
      "bestMove",
      "bestChain",
      "muted",
      "simTime",
    ] as const)
      api.diagnostics.register(key, (s) => s[key]);
    api.diagnostics.register("cols", (s) => s.board.cols);
    api.diagnostics.register("rows", (s) => s.board.rows);
    api.diagnostics.register(
      "levelTarget",
      (s) => s.level * C.LEVEL_TARGET_STEP,
    );
    api.diagnostics.register("multiplier", (s) =>
      Math.min(s.chainStep, C.MAX_MULTIPLIER),
    );
    api.diagnostics.register("lastFall", lastFall);
    api.diagnostics.register("legalSwap", (s) => legalSwap(s.board));
    for (const key of ["selection", "offer"] as const)
      api.diagnostics.register(key, (s) =>
        s[key] ? `${s[key].col},${s[key].row}` : "none",
      );
    api.diagnostics.register(
      "pointer",
      (s) =>
        `${s.pointer.x.toFixed(0)},${s.pointer.y.toFixed(0)} ${s.pointer.device}`,
    );
    return [{ ...initial(), assets }, debug];
  },
  update(s, api, dt) {
    let next: FacetState = { ...s };
    const cues = new Set<string>();
    const compare = (before: State, after: State) => {
      if (before.selection !== after.selection && after.selection)
        cues.add(C.CUES.select);
      if (before.phase === "idle" && after.phase === "swapping")
        cues.add(C.CUES.swap);
      if (before.refusal !== after.refusal && after.refusal?.timer === 0)
        cues.add(C.CUES.refuse);
    };
    if (api.input.pressed("mute")) api.audio.setMuted(!api.audio.muted());
    const screen = next.screen;
    if (api.input.pressed("pause")) next = pause(next);
    if (
      api.input.pressed("back") &&
      screen !== "playing" &&
      screen !== "paused"
    )
      next = back(next);
    const items = menuItems(next.screen);
    if (items.length) {
      if (api.input.pressed("up"))
        next = {
          ...next,
          menuIndex: (next.menuIndex + items.length - 1) % items.length,
        };
      if (api.input.pressed("down"))
        next = { ...next, menuIndex: (next.menuIndex + 1) % items.length };
      if (api.input.pressed("confirm")) next = confirm(next);
    }
    for (const sample of api.input.pointerSamples())
      if (
        sample.primary &&
        (sample.button === null || sample.button === "primary")
      ) {
        const before = next;
        next = pointer(next, sample.type, sample.x, sample.y, sample.device);
        compare(before, next);
      }
    const before = next;
    let rung = 1;
    next = advance(next, dt, (cue, step) => {
      cues.add(cue);
      if (cue === C.CUES.clear) rung = Math.min(step, C.MAX_MULTIPLIER);
    });
    if (before.screen !== next.screen && next.screen === "levelclear")
      cues.add(C.CUES.levelUp);
    if (before.screen !== next.screen && next.screen === "gameover")
      cues.add(C.CUES.gameOver);
    if (cues.has(C.CUES.clear)) api.audio.play(`chain-${rung}`);
    for (const cue of cues) api.audio.play(cue);
    const title = next.screen === "title" || next.screen === "howto";
    api.audio.stop(title ? "play-bed" : "title-theme");
    api.audio.loop(title ? "title-theme" : "play-bed");
    return { ...next, pointer: api.input.pointer(), muted: api.audio.muted() };
  },
  render: renderScene,
};
