/// <reference types="node" />
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { readFile } from "node:fs/promises";
import { createEngine, ConstantClock } from "@clockwyrks/simple-2d";
import {
  game,
  initial,
  deal,
  runs,
  legalSwap,
  advance,
  resolve,
  cellX,
  cellY,
  type FacetState,
} from "./game";
import * as C from "./constants";

const rows = Array.from({ length: 8 }, (_, r) =>
  Array.from({ length: 8 }, (_, c) => "RACJBSM"[(c + r * 2) % 7] + "0").join(
    " ",
  ),
);
async function setup(step = 20, events = new EventTarget()) {
  const canvas = createCanvas(1280, 720);
  const engine = createEngine({
    canvas: canvas as unknown as HTMLCanvasElement,
    width: C.STAGE_W,
    height: C.STAGE_H,
    background: "#0b141d",
    game,
    layout: C.LAYOUT,
    clock: new ConstantClock(step),
    surface: {
      cssWidth: () => 1280,
      cssHeight: () => 720,
      dpr: () => 1,
      events: () => events,
    },
  });
  await engine.initialize();
  return engine;
}
beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    async (url: string) => new Response(await readFile(`public/${url}`)),
  );
  vi.stubGlobal("createImageBitmap", async (blob: Blob) =>
    loadImage(Buffer.from(await blob.arrayBuffer())),
  );
  vi.stubGlobal(
    "AudioContext",
    class {
      async decodeAudioData() {
        return {};
      }
    },
  );
});
afterEach(() => vi.unstubAllGlobals());
describe("board and simulation", () => {
  it("deals plain, unstrained openings with no runs and at least one move", () => {
    for (let i = 0; i < 40; i++) {
      const b = deal();
      expect(runs(b)).toHaveLength(0);
      expect(legalSwap(b)).toBe(true);
      expect(
        b.cells.every(
          (g) => g.cut === "plain" && g.strain === 0 && g.fell >= g.row + 1,
        ),
      ).toBe(true);
    }
  });
  it("initializes every declared field and awaits every produced asset", async () => {
    const e = await setup();
    expect(e.debug.version).toBe(1);
    expect(e.debug.snapshot(e.state).board.cells).toHaveLength(0);
    expect(Object.keys(e.state.assets!.images)).toHaveLength(109);
    expect(e.state.assets!.fx.aura.loop).toBe(true);
    e.destroy();
  });
  it("poses values independently and validates fixed domains", async () => {
    const e = await setup(),
      d = e.debug;
    e.apply((s) => d.loadBoard(s, rows));
    const before = e.state;
    e.apply((s) => d.setScreen(s, "playing"));
    e.apply((s) => d.setScore(s, 900));
    e.apply((s) => d.setLevel(s, 4));
    e.apply((s) => d.setMenuIndex(s, 99));
    e.apply((s) => d.setSelection(s, 7, 7));
    e.apply((s) => d.setOffer(s, 0, 0));
    e.apply((s) => d.setGem(s, 2, 2, "X3"));
    e.apply((s) => d.setRefillKinds(s, 3, "RAC"));
    const snap = d.snapshot(e.state);
    expect(snap.levelTarget).toBe(8000);
    expect(snap.board.cells[18].kind).toBeNull();
    expect(snap.selection).toEqual({ col: 7, row: 7 });
    expect(before.score).toBe(0);
    expect(() => d.setGem(e.state, 8, 0, "R0")).toThrow();
    expect(() => d.loadBoard(e.state, ["R0"])).toThrow();
    expect(() => d.setGem(e.state, 0, 0, "X0b")).toThrow();
    expect(() => d.setLevel(e.state, 0)).toThrow();
    expect(() => d.setRefillKinds(e.state, 0, "X")).toThrow();
    expect(d.reconcile(e.state)).toEqual(e.state);
    e.destroy();
  });
  it("refuses unproductive and nonadjacent swaps without changing gems", async () => {
    const e = await setup(),
      d = e.debug;
    e.apply((s) => d.loadBoard(s, rows));
    e.apply((s) => d.setScreen(s, "playing"));
    const board = e.state.board;
    e.apply((s) => d.requestSwap(s, 0, 0, 7, 7));
    expect(e.state.board).toEqual(board);
    expect(e.state.refusal).not.toBeNull();
    await e.advance(15);
    expect(e.state.refusal).toBeNull();
    e.apply((s) => d.requestSwap(s, 0, 0, 1, 0));
    expect(e.state.phase).toBe("idle");
    expect(e.state.board).toEqual(board);
    e.destroy();
  });
  it("plays a release offer immediately and cancels a return drag", async () => {
    const e = await setup(),
      d = e.debug;
    e.apply((s) => d.loadBoard(s, rows));
    e.apply((s) => d.setScreen(s, "playing"));
    e.apply((s) => d.setGem(s, 0, 0, "X0"));
    e.apply((s) => d.pointerDown(s, cellX(0), cellY(0), "touch"));
    e.apply((s) => d.pointerMove(s, cellX(1), cellY(0), "touch"));
    expect(e.state.offer?.col).toBe(1);
    e.apply((s) => d.pointerMove(s, cellX(0), cellY(0), "touch"));
    expect(e.state.offer).toBeNull();
    e.apply((s) => d.pointerUp(s, "touch"));
    expect(e.state.phase).toBe("idle");
    e.apply((s) => d.pointerDown(s, cellX(1), cellY(0), "touch"));
    e.apply((s) => d.pointerUp(s, "touch"));
    expect(e.state.phase).toBe("swapping");
    expect(e.state.selection).toBeNull();
    expect(e.state.board.cells[1].cut).toBe("prism");
    await e.advance(9);
    expect(e.state.chainStep).toBe(1);
    expect(e.state.lastCleared).toBeGreaterThan(1);
    e.destroy();
  });
  it("expands breadth-first through brilliant, star, and flawed stones", async () => {
    const e = await setup(),
      d = e.debug;
    e.apply((s) => d.loadBoard(s, rows));
    for (const [col, row, token] of [
      [0, 0, "R0"],
      [1, 0, "R0b"],
      [2, 0, "R0"],
      [3, 0, "J3"],
      [4, 0, "B3"],
      [1, 1, "A0s"],
    ] as const)
      e.apply((s) => d.setGem(s, col, row, token));
    const s = resolve({ ...e.state, phase: "resolving", chainStep: 1 });
    expect(s.lastCleared).toBeGreaterThan(17);
    expect(s.lastWaves).toBeGreaterThan(1);
    expect(
      s.shards?.find((v) => v.gem.col === 4 && v.gem.row === 0)?.wave,
    ).toBe(2);
    expect(s.lastPoints).toBe(s.lastCleared * 10 + 20);
    expect(s.bestChain).toBe(1);
    e.destroy();
  });
  it("creates brilliant, prism and intersection star with the correct precedence", async () => {
    const e = await setup(),
      d = e.debug;
    let s = d.loadBoard(initial(), rows);
    for (let c = 0; c < 4; c++) s = d.setGem(s, c, 3, "R0");
    let next = resolve({ ...s, chainStep: 1, phase: "resolving" });
    expect(next.board.cells.some((g) => g.cut === "brilliant")).toBe(true);
    s = d.setGem(s, 4, 3, "R0");
    next = resolve({ ...s, chainStep: 1, phase: "resolving" });
    expect(
      next.board.cells.some((g) => g.cut === "prism" && g.kind === null),
    ).toBe(true);
    s = d.loadBoard(initial(), rows);
    for (const [c, r] of [
      [2, 3],
      [3, 3],
      [4, 3],
      [3, 2],
      [3, 4],
    ])
      s = d.setGem(s, c, r, "M0");
    next = resolve({ ...s, chainStep: 1, phase: "resolving" });
    expect(next.board.cells.some((g) => g.cut === "star")).toBe(true);
    e.destroy();
  });
  it("caps neighbor strain once per step and preserves fall after rest", async () => {
    const e = await setup(),
      d = e.debug;
    let s = d.loadBoard({ ...initial(), screen: "playing" }, rows);
    for (let c = 0; c < 3; c++) s = d.setGem(s, c, 7, "R0");
    s = d.setGem(s, 0, 6, "B2");
    for (let col = 0; col < 8; col++)
      s = d.setRefillKinds(s, col, "RACJBSM"[(col + 4) % 7]);
    s = resolve({ ...s, phase: "resolving", chainStep: 1 });
    expect(s.board.cells[56].strain).toBe(3);
    expect(s.board.cells[56].fell).toBe(1);
    const settled = advance(s, 2);
    expect(settled.board.cells[56].fell).toBeGreaterThanOrEqual(1);
    e.destroy();
  });
  it("poses refill per destination row and uses multiplier cap", async () => {
    const e = await setup(),
      d = e.debug;
    let s = d.loadBoard(initial(), rows);
    for (let r = 0; r < 3; r++) s = d.setGem(s, 0, r, "R0");
    s = d.setRefillKinds(s, 0, "MBS");
    s = resolve({ ...s, chainStep: 12, phase: "resolving" });
    expect(s.board.cells[0].kind).toBe("amethyst");
    expect(s.board.cells[8].kind).toBe("beryl");
    expect(s.board.cells[16].kind).toBe("sapphire");
    expect(s.lastPoints).toBe(s.lastCleared * 80);
    e.destroy();
  });
  it("freezes every board timer outside playing while simTime advances", async () => {
    const e = await setup(),
      d = e.debug;
    e.apply((s) => d.loadBoard(s, rows));
    e.apply((s) => d.setGem(s, 0, 0, "X0"));
    e.apply((s) => d.requestSwap(s, 0, 0, 1, 0));
    e.apply((s) => d.setScreen(s, "paused"));
    const before = e.state;
    await e.advance(25);
    expect(e.state.swapTimer).toBe(before.swapTimer);
    expect(e.state.board).toEqual(before.board);
    expect(e.state.simTime).toBeCloseTo(0.5);
    e.destroy();
  });
  it("resolves identically across differently divided deltas with deterministic refill", async () => {
    const e = await setup(),
      d = e.debug;
    let s = d.loadBoard({ ...initial(), screen: "playing" }, rows);
    for (let c = 0; c < 8; c++) s = d.setRefillKinds(s, c, "RACJBSMR");
    s = d.setGem(s, 0, 0, "X0");
    s = d.requestSwap(s, 0, 0, 1, 0);
    let a: FacetState = s,
      b: FacetState = s;
    for (let i = 0; i < 50; i++) a = advance(a, 0.01);
    for (let i = 0; i < 5; i++) b = advance(b, 0.1);
    expect(a.board).toEqual(b.board);
    expect(a.score).toBe(b.score);
    expect(a.stepTimer).toBeCloseTo(b.stepTimer);
    e.destroy();
  });
  it("prioritizes level completion over no-moves and abandons the board on quit", async () => {
    const e = await setup(),
      d = e.debug;
    let s = d.loadBoard(
      {
        ...initial(),
        screen: "playing",
        levelScore: 2000,
        phase: "resolving",
        chainStep: 2,
        moveScore: 120,
      },
      rows,
    );
    s = advance(s, 1);
    expect(s.screen).toBe("levelclear");
    expect(s.bestMove).toBe(120);
    e.apply(() => s);
    e.apply((state) => d.pointerDown(state, 640, 554));
    e.apply((state) => d.pointerUp(state));
    expect(e.state.screen).toBe("title");
    expect(e.state.board.cells).toHaveLength(0);
    expect(e.state.levelScore).toBe(2000);
    e.destroy();
  });
  it("reports no moves from a posed dead board without reconciling it away", async () => {
    const e = await setup(),
      d = e.debug;
    e.apply((s) => d.loadBoard(s, rows));
    expect(d.snapshot(e.state).legalSwap).toBe(false);
    const s = advance(
      { ...e.state, screen: "playing", phase: "resolving", chainStep: 1 },
      1,
    );
    expect(s.screen).toBe("gameover");
    e.destroy();
  });
  it("touch targets arm, cancel outside, navigate howto and start a round", async () => {
    const e = await setup(),
      d = e.debug;
    for (const screen of [
      "title",
      "howto",
      "playing",
      "paused",
      "levelclear",
      "gameover",
    ] as const) {
      const snap = d.snapshot(d.setScreen(e.state, screen));
      expect(
        snap.targets.every(
          (t) =>
            t.w >= 96 &&
            t.h >= 72 &&
            t.x >= 0 &&
            t.y >= 0 &&
            t.x + t.w <= 1280 &&
            t.y + t.h <= 720,
        ),
      ).toBe(true);
    }
    e.apply((s) => d.pointerDown(s, 640, 554));
    e.apply((s) => d.pointerMove(s, 0, 0));
    e.apply((s) => d.pointerUp(s));
    expect(e.state.screen).toBe("title");
    e.apply((s) => d.pointerDown(s, 640, 554));
    e.apply((s) => d.pointerUp(s));
    expect(e.state.screen).toBe("howto");
    e.apply((s) => d.pointerDown(s, 1120, 648));
    e.apply((s) => d.pointerUp(s));
    expect(e.state.menuIndex).toBe(1);
    e.apply((s) => d.pointerDown(s, 640, 466));
    e.apply((s) => d.pointerUp(s));
    expect(e.state.screen).toBe("playing");
    expect(e.state.board.cells).toHaveLength(64);
    await e.advance(30);
    e.destroy();
  });
  it("drives every keyboard menu, resumes, mutes, and starts a fresh round", async () => {
    const events = new EventTarget();
    const e = await setup(20, events);
    async function key(code: string) {
      events.dispatchEvent(
        Object.assign(new Event("keydown"), { code, repeat: false }),
      );
      await e.advance(1);
      events.dispatchEvent(Object.assign(new Event("keyup"), { code }));
    }
    await key("ArrowUp");
    expect(e.state.menuIndex).toBe(1);
    await key("Space");
    expect(e.state.screen).toBe("howto");
    await key("Escape");
    expect(e.state.screen).toBe("title");
    expect(e.state.menuIndex).toBe(1);
    await key("ArrowDown");
    await key("Enter");
    expect(e.state.screen).toBe("playing");
    await key("KeyM");
    expect(e.state.muted).toBe(true);
    await key("KeyP");
    expect(e.state.screen).toBe("paused");
    await key("Escape");
    expect(e.state.screen).toBe("playing");
    await key("Escape");
    await key("ArrowDown");
    await key("Enter");
    expect(e.state.board.cells).toHaveLength(0);
    await key("Enter");
    expect(e.state.score).toBe(0);
    expect(e.state.level).toBe(1);
    expect(e.state.muted).toBe(true);
    e.apply((s) => e.debug.setScreen(s, "levelclear"));
    e.apply((s) => e.debug.setScore(s, 123));
    e.apply((s) => e.debug.setLevelScore(s, 2345));
    await key("Enter");
    expect(e.state.level).toBe(2);
    expect(e.state.score).toBe(123);
    expect(e.state.levelScore).toBe(0);
    e.apply((s) => e.debug.setScreen(s, "gameover"));
    await key("Escape");
    expect(e.state.board.cells).toHaveLength(64);
    e.apply((s) => e.debug.setScreen(s, "gameover"));
    await key("Enter");
    expect(e.state.level).toBe(1);
    expect(e.state.score).toBe(0);
    e.destroy();
  });
  it("reads ordered real pointer samples and plays one clear cue on the resolution frame", async () => {
    const events = new EventTarget(),
      e = await setup(20, events),
      d = e.debug;
    const cues: string[] = [];
    e.events.on("cue:played", (v) => cues.push(v.cue));
    e.apply((s) => d.loadBoard(s, rows));
    e.apply((s) => d.setScreen(s, "playing"));
    e.apply((s) => d.setGem(s, 0, 0, "X0"));
    for (const [type, x] of [
      ["pointerdown", 388],
      ["pointermove", 460],
      ["pointerup", 460],
    ] as const)
      events.dispatchEvent(
        Object.assign(new Event(type), {
          pointerId: 1,
          isPrimary: true,
          pointerType: "mouse",
          button: 0,
          buttons: type === "pointerup" ? 0 : 1,
          clientX: x,
          clientY: 144,
        }),
      );
    await e.advance(1);
    expect(e.state.phase).toBe("swapping");
    expect(cues.filter((v) => v === C.CUES.select)).toHaveLength(1);
    expect(cues.filter((v) => v === C.CUES.swap)).toHaveLength(1);
    await e.advance(8);
    expect(e.state.lastCleared).toBeGreaterThan(0);
    expect(cues.filter((v) => v === C.CUES.clear)).toHaveLength(1);
    await e.advance(1);
    expect(cues.filter((v) => v === C.CUES.clear)).toHaveLength(1);
    e.destroy();
  });
  it("clears each posed element independently and resets every authoritative field", async () => {
    const e = await setup(),
      d = e.debug;
    let s = d.loadBoard(e.state, rows);
    s = d.setBestChain(s, 7);
    s = d.setBestMove(s, 600);
    s = d.setMoveScore(s, 300);
    s = d.setSelection(s, 2, 2);
    s = d.setOffer(s, 3, 2);
    s = d.setRefillKinds(s, 2, "RAC");
    s = d.requestSwap(s, 0, 0, 7, 7);
    s = d.clearRefusal(s);
    s = d.clearSelection(s);
    expect(s.offer).not.toBeNull();
    s = d.clearOffer(s);
    s = d.clearRefillKinds(s);
    s = d.clearChain(s);
    expect(s.bestChain).toBe(7);
    expect(s.bestMove).toBe(600);
    s = d.clearBoard(s);
    expect(s.score).toBe(0);
    expect(s.board.cols).toBe(0);
    s = d.dealBoard(s);
    expect(legalSwap(s.board)).toBe(true);
    const reset = d.reset({ ...s, muted: true });
    expect(reset.muted).toBe(true);
    expect(reset.board.cells).toHaveLength(0);
    expect(reset.bestMove).toBe(0);
    expect(reset.simTime).toBe(0);
    expect(() => d.setScreen(s, "bad" as never)).toThrow();
    expect(() => d.setMenuIndex(s, -1)).toThrow();
    expect(() => d.pointerDown(s, NaN, 0)).toThrow();
    expect(() => d.setGem(reset, 0, 0, "R0")).toThrow();
    e.destroy();
  });
});
