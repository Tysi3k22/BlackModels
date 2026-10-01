import { useCallback, useEffect, useRef, useState } from "react";
import { PanelTitle, ToolButton, Divider } from "../components/Panel";
import { TextureTools, useApp } from "../constants";
import {
  CubeFaces,
  FACE_NAMES,
  FaceName,
  FaceUV,
  ProjectTexture,
  selectFaceOverlay,
  selectSelectedCube,
  useModel,
} from "../stores/modelStore";
import { flipUV } from "../lib/uv";
import { openImageFile } from "../lib/files";
import { EditorScene } from "../components/Viewport";

const tools: TextureTools[] = ["Brush", "Pencil", "Eraser", "Fill", "Picker", "UV"];

const toolCursor: Record<TextureTools, string> = {
  Brush: "crosshair",
  Pencil: "crosshair",
  Eraser: "cell",
  Fill: "crosshair",
  Picker: "copy",
  UV: "move",
};

const PALETTE = [
  "#000000", "#ffffff", "#9e2b25", "#da6c2c", "#e8c547",
  "#5d8c3a", "#3d6ea5", "#6f4e9c", "#8a5a44", "#7a7a7a",
];

import { floodFillAt, paintLine, paintSquare } from "../lib/paint";

const OVERLAY_COLORS: Record<FaceName, string> = {
  north: "#4ea1ff",
  east: "#ffd166",
  south: "#ef476f",
  west: "#06d6a0",
  up: "#a78bfa",
  down: "#f97316",
};

/** Ensure the painted cube's faces are bound to the active texture. */
function overlayCubeUpdates(
  overlay: ReturnType<typeof selectFaceOverlay>
): { face: FaceName; uv: [number, number, number, number]; cubeId?: string }[] {
  if (!overlay || overlay.kind !== "cube" || !overlay.id) return [];
  const out: { face: FaceName; uv: [number, number, number, number]; cubeId?: string }[] = [];
  for (const face of FACE_NAMES) {
    const f = overlay.faces[face];
    if (f) out.push({ face, uv: f.uv, cubeId: overlay.id });
  }
  return out;
}

/** A UV rect split into its normalized box and flip flags (x1 > x2 means mirrored). */
interface UVBox {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  flipX: boolean;
  flipY: boolean;
}

function toBox(uv: FaceUV): UVBox {
  return {
    x1: Math.min(uv[0], uv[2]),
    y1: Math.min(uv[1], uv[3]),
    x2: Math.max(uv[0], uv[2]),
    y2: Math.max(uv[1], uv[3]),
    flipX: uv[0] > uv[2],
    flipY: uv[1] > uv[3],
  };
}

function fromBox(b: UVBox): FaceUV {
  return [
    b.flipX ? b.x2 : b.x1,
    b.flipY ? b.y2 : b.y1,
    b.flipX ? b.x1 : b.x2,
    b.flipY ? b.y1 : b.y2,
  ];
}

/** Face under a texture-space point; the already-selected face wins ties, else the smallest face. */
function hitFace(
  faces: CubeFaces,
  x: number,
  y: number,
  prefer: FaceName | null,
  slop: number
): FaceName | null {
  let best: FaceName | null = null;
  let bestArea = Infinity;
  for (const face of FACE_NAMES) {
    const f = faces[face];
    if (!f) continue;
    const b = toBox(f.uv);
    if (x < b.x1 - slop || x > b.x2 + slop || y < b.y1 - slop || y > b.y2 + slop) continue;
    if (face === prefer) return face;
    const area = (b.x2 - b.x1) * (b.y2 - b.y1);
    if (area < bestArea) {
      best = face;
      bestArea = area;
    }
  }
  return best;
}

interface UVDrag {
  cubeId: string;
  face: FaceName;
  mode: "move" | "resize";
  /** Pointer position (texture px) when the drag started. */
  start: [number, number];
  box: UVBox;
  /** Whether the undo snapshot for this drag has been taken. */
  began: boolean;
}

function PaintCanvas({ tex }: { tex: ProjectTexture }) {
  const tool = useApp((s) => s.textureTool);
  const color = useApp((s) => s.textureColor);
  const setColor = useApp((s) => s.setTextureColor);
  const brushSize = useApp((s) => s.textureBrushSize);
  const setBrushSize = useApp((s) => s.setTextureBrushSize);
  const commitTexturePixels = useModel((s) => s.commitTexturePixels);
  const overlay = useModel(selectFaceOverlay);
  const resolution = useModel((s) => s.resolution);
  const uvFace = useApp((s) => s.uvFace);
  const setUvFace = useApp((s) => s.setUvFace);
  const uvDrag = useRef<UVDrag | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const pristine = useRef<HTMLImageElement | null>(null);
  const [ready, setReady] = useState(0);
  const stroke = useRef<{ last: [number, number] } | null>(null);
  /** Bitmap coords under the cursor — drives the brush-size preview. */
  const [brushCursor, setBrushCursor] = useState<{ x: number; y: number } | null>(null);

  const [resW, resH] = resolution;
  const areaRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState<number | null>(null);
  const [area, setArea] = useState<[number, number]>([256, 256]);

  useEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setArea([el.clientWidth, el.clientHeight]));
    ro.observe(el);
    setArea([el.clientWidth, el.clientHeight]);
    return () => ro.disconnect();
  }, []);

  const autoZoom = Math.max(0.25, Math.min((area[0] - 32) / resW, (area[1] - 32) / resH));
  const currentZoom = zoom ?? autoZoom;
  const dispW = Math.round(resW * currentZoom);
  const dispH = Math.round(resH * currentZoom);

  useEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      setZoom((z) => {
        const prev = z ?? autoZoom;
        const newZoom = prev * (e.deltaY > 0 ? 0.8 : 1.25);
        return Math.max(0.1, Math.min(newZoom, 32));
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [autoZoom]);

  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (!canvas || !ctx) return;
      ctx.imageSmoothingEnabled = false;
      ctx.clearRect(0, 0, resW, resH);
      ctx.drawImage(img, 0, 0, resW, resH);
      pristine.current = img;
      setReady((t) => t + 1);
    };
    img.src = tex.source;
  }, [tex.source, resW, resH]);

  useEffect(() => {
    const canvas = overlayRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, resW, resH);
    if (!overlay) return;
    const [ovW, ovH] = overlay.resolution;
    ctx.lineWidth = 1.5;
    ctx.font = "12px monospace";
    for (const face of FACE_NAMES) {
      const f = overlay.faces[face];
      if (!f) continue;
      const x1 = (f.uv[0] / ovW) * resW;
      const y1 = (f.uv[1] / ovH) * resH;
      const x2 = (f.uv[2] / ovW) * resW;
      const y2 = (f.uv[3] / ovH) * resH;
      const lx = Math.min(x1, x2);
      const ly = Math.min(y1, y2);
      const lw = Math.abs(x2 - x1);
      const lh = Math.abs(y2 - y1);
      const active = tool === "UV" && face === uvFace;
      ctx.strokeStyle = OVERLAY_COLORS[face];
      ctx.lineWidth = active ? 2.5 : 1.5;
      if (active) {
        ctx.globalAlpha = 0.18;
        ctx.fillStyle = OVERLAY_COLORS[face];
        ctx.fillRect(lx, ly, lw, lh);
        ctx.globalAlpha = 1;
      }
      ctx.strokeRect(lx, ly, lw, lh);
      ctx.fillStyle = OVERLAY_COLORS[face];
      ctx.fillText(face, lx + 3, Math.min(ly + 13, resH - 3));
      if (active) {
        // resize handle on the bottom-right corner
        const hs = Math.max(1.5, 6 / currentZoom);
        ctx.fillRect(lx + lw - hs / 2, ly + lh - hs / 2, hs, hs);
      }
    }
  }, [overlay, ready, resW, resH, tool, uvFace, currentZoom]);

  const toPx = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>): [number, number] | null => {
      const rect = e.currentTarget.getBoundingClientRect();
      const px = Math.floor(((e.clientX - rect.left) / rect.width) * resW);
      const py = Math.floor(((e.clientY - rect.top) / rect.height) * resH);
      if (px < 0 || py < 0 || px >= resW || py >= resH) return null;
      return [px, py];
    },
    [resW, resH]
  );

  /** Track the bitmap pixel under the cursor (null → hide preview). */
  const updateBrushCursor = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const hit = toPx(e);
    setBrushCursor(hit ? { x: hit[0], y: hit[1] } : null);
  };

  /** Pointer position in (fractional) texture pixels; may fall outside the canvas. */
  const toPxF = (e: React.PointerEvent<HTMLCanvasElement>): [number, number] => {
    const rect = e.currentTarget.getBoundingClientRect();
    return [
      ((e.clientX - rect.left) / rect.width) * resW,
      ((e.clientY - rect.top) / rect.height) * resH,
    ];
  };

  const startUVDrag = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!overlay || overlay.kind !== "cube" || !overlay.id) return;
    const [fx, fy] = toPxF(e);
    const face = hitFace(overlay.faces, fx, fy, uvFace, 0.5);
    if (!face) return;
    const box = toBox(overlay.faces[face]!.uv);
    const grab = Math.max(1.5, 6 / currentZoom);
    const onHandle =
      face === uvFace && Math.abs(fx - box.x2) <= grab && Math.abs(fy - box.y2) <= grab;
    setUvFace(face);
    e.currentTarget.setPointerCapture(e.pointerId);
    uvDrag.current = {
      cubeId: overlay.id,
      face,
      mode: onHandle ? "resize" : "move",
      start: [fx, fy],
      box,
      began: false,
    };
  };

  const moveUVDrag = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const d = uvDrag.current;
    if (!d) return;
    const [fx, fy] = toPxF(e);
    const dx = Math.round(fx - d.start[0]);
    const dy = Math.round(fy - d.start[1]);
    const b = d.box;
    let next: UVBox;
    if (d.mode === "move") {
      // Keep the whole rect inside the atlas instead of squashing it at the edges.
      const w = b.x2 - b.x1;
      const h = b.y2 - b.y1;
      const x1 = Math.min(Math.max(0, b.x1 + dx), Math.max(0, resW - w));
      const y1 = Math.min(Math.max(0, b.y1 + dy), Math.max(0, resH - h));
      next = { ...b, x1, y1, x2: x1 + w, y2: y1 + h };
    } else {
      next = {
        ...b,
        x2: Math.min(resW, Math.max(b.x1, b.x2 + dx)),
        y2: Math.min(resH, Math.max(b.y1, b.y2 + dy)),
      };
    }
    const uv = fromBox(next);
    const st = useModel.getState();
    const cur = st.cubes.find((c) => c.id === d.cubeId)?.faces?.[d.face]?.uv;
    if (cur && cur[0] === uv[0] && cur[1] === uv[1] && cur[2] === uv[2] && cur[3] === uv[3]) return;
    if (!d.began) {
      st.beginTransform(); // the whole drag is one undo step
      d.began = true;
    }
    st.setFaceUV(d.cubeId, d.face, uv);
  };

  const onDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!pristine.current) return;
    if (tool === "UV") {
      startUVDrag(e);
      return;
    }
    const hit = toPx(e);
    if (!hit) return;
    updateBrushCursor(e);
    const ctx = canvasRef.current!.getContext("2d")!;
    ctx.imageSmoothingEnabled = false;
    e.currentTarget.setPointerCapture(e.pointerId);

    if (tool === "Picker") {
      const d = ctx.getImageData(hit[0], hit[1], 1, 1).data;
      if (d[3] > 0) {
        setColor(`#${[d[0], d[1], d[2]].map((v) => v.toString(16).padStart(2, "0")).join("")}`);
      }
      return;
    }
    if (tool === "Fill") {
      floodFillAt(ctx, hit[0], hit[1], color, resW, resH);
      commit();
      return;
    }
    stroke.current = { last: hit };
    paintSquare(ctx, hit[0], hit[1], tool === "Pencil" ? 1 : brushSize, tool === "Eraser", color);
  };

  const onMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    updateBrushCursor(e);
    if (uvDrag.current) {
      moveUVDrag(e);
      return;
    }
    if (!stroke.current || !pristine.current) return;
    const hit = toPx(e);
    if (!hit) return;
    const ctx = canvasRef.current!.getContext("2d")!;
    paintLine(ctx, stroke.current.last, hit, tool === "Pencil" ? 1 : brushSize, tool === "Eraser", color);
    stroke.current = { last: hit };
  };

  const onUp = () => {
    if (uvDrag.current) {
      uvDrag.current = null;
      return;
    }
    if (stroke.current) {
      stroke.current = null;
      commit();
    }
  };

  const commit = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    commitTexturePixels(canvas.toDataURL("image/png"), { faces: overlayCubeUpdates(overlay) });
  };

  const effSize = tool === "Pencil" ? 1 : brushSize;
  const effHalf = Math.floor(effSize / 2);
  const sizeTools = tool === "Brush" || tool === "Pencil" || tool === "Eraser";

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div
        ref={areaRef}
        className="flex min-h-0 flex-1 overflow-auto bg-[#131418]"
      >
        <div className="m-auto p-4">
          <div
            className="relative shrink-0 border border-border shadow-lg"
            style={{ width: dispW, height: dispH }}
          >
            <canvas
              ref={canvasRef}
              width={resW}
              height={resH}
              style={{
                width: dispW,
                height: dispH,
                imageRendering: "pixelated",
                cursor: toolCursor[tool],
                touchAction: "none",
                background:
                  "repeating-conic-gradient(#2a2c31 0% 25%, #1d1f23 0% 50%) 0 0 / 16px 16px",
              }}
              onPointerDown={onDown}
              onPointerMove={onMove}
              onPointerUp={onUp}
              onPointerLeave={() => setBrushCursor(null)}
            />
            <canvas
              ref={overlayRef}
              width={resW}
              height={resH}
              className="pointer-events-none absolute inset-0"
              style={{ width: dispW, height: dispH, imageRendering: "pixelated" }}
            />
            {sizeTools && brushCursor && (
              <div
                className="pointer-events-none absolute z-10 rounded-[1px] border border-white/90"
                style={{
                  left: (brushCursor.x - effHalf) * currentZoom,
                  top: (brushCursor.y - effHalf) * currentZoom,
                  width: Math.max(effSize * currentZoom, 2),
                  height: Math.max(effSize * currentZoom, 2),
                  boxShadow: "0 0 0 1px rgba(0,0,0,0.65)",
                }}
              />
            )}
          </div>
        </div>
      </div>

      {tool === "UV" ? (
        <div className="shrink-0 border-t border-border bg-panel px-2 py-1.5 text-[10px] leading-4 text-neutral-500">
          {overlay?.kind === "cube"
            ? "Drag a face to move it · drag its corner handle to resize"
            : "Select a cube to edit its UVs"}
        </div>
      ) : (
      <div className="flex shrink-0 flex-wrap items-center gap-x-2 gap-y-1 border-t border-border bg-panel px-2 py-1.5">
        <div className="flex items-center gap-1">
          {PALETTE.map((c) => (
            <button
              key={c}
              onClick={() => setColor(c)}
              title={c}
              className={`size-4 rounded border ${
                color === c ? "border-accent ring-1 ring-accent" : "border-border"
              }`}
              style={{ backgroundColor: c }}
            />
          ))}
          <input
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            className="size-4 cursor-pointer rounded border border-border bg-transparent p-0"
            title="Custom color"
          />
        </div>
        <span className="h-3 w-px bg-border" />
        <div className="flex items-center gap-1">
          <span className="text-[10px] text-neutral-500">Size</span>
          {[1, 2, 4, 8].map((s) => (
            <button
              key={s}
              onClick={() => setBrushSize(s)}
              className={`rounded px-1 text-[10px] ${
                brushSize === s ? "bg-accent/20 text-accent" : "text-neutral-400 hover:bg-panel-2"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>
      )}
    </div>
  );
}

function NumField({
  label,
  value,
  onCommit,
}: {
  label: string;
  value: number;
  onCommit: (n: number) => void;
}) {
  // Edit as text and commit on blur/Enter, so typing "12" is one undo step, not two.
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    if (draft == null) return;
    const n = parseInt(draft, 10);
    setDraft(null);
    if (!Number.isNaN(n) && n !== value) onCommit(n);
  };
  return (
    <label className="flex items-center gap-1 text-[10px] text-neutral-500">
      <span className="w-4 shrink-0">{label}</span>
      <input
        type="number"
        value={draft ?? value}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") {
            setDraft(null);
            e.currentTarget.blur();
          }
        }}
        className="w-full min-w-0 rounded border border-border bg-panel-2 px-1 py-0.5 text-[11px] text-neutral-200 outline-none focus:border-accent"
      />
    </label>
  );
}

/** Per-face UV numbers + auto-unwrap buttons for the selected cube. */
function UVPanel() {
  const cube = useModel(selectSelectedCube);
  const activeTexture = useModel((s) => s.activeTexture);
  const setFaceUV = useModel((s) => s.setFaceUV);
  const autoUV = useModel((s) => s.autoUV);
  const uvFace = useApp((s) => s.uvFace);
  const setUvFace = useApp((s) => s.setUvFace);
  const [note, setNote] = useState<string | null>(null);

  const run = (scope: "selected" | "all") => {
    const r = autoUV(scope);
    setNote(
      r.count === 0
        ? "Nothing to unwrap."
        : r.overflow > 0
          ? `${r.count} cube(s) unwrapped, ${r.overflow} didn't fit — the texture is too small.`
          : `${r.count} cube(s) unwrapped.`
    );
  };

  const face = cube && uvFace && cube.faces?.[uvFace] ? uvFace : null;
  const uv = cube && face ? cube.faces![face]!.uv : null;
  const btn =
    "rounded border border-border px-2 py-1 text-[11px] text-neutral-200 hover:bg-panel-2 disabled:pointer-events-none disabled:opacity-30";

  return (
    <div className="shrink-0 border-t border-border p-2">
      <div className="mb-1.5 text-[11px] font-semibold tracking-widest text-neutral-500">UV</div>
      <div className="mb-2 flex gap-1.5">
        <button
          onClick={() => run("selected")}
          disabled={!cube}
          title="Unwrap the selected cube into free space on the texture"
          className={`${btn} flex-1`}
        >
          Auto UV: cube
        </button>
        <button
          onClick={() => run("all")}
          title="Repack every cube on the active texture"
          className={`${btn} flex-1`}
        >
          Auto UV: all
        </button>
      </div>
      {note && <p className="mb-2 text-[10px] leading-4 text-neutral-400">{note}</p>}

      {!cube ? (
        <p className="text-[10px] leading-4 text-neutral-500">Select a cube to edit its faces.</p>
      ) : activeTexture == null ? (
        <p className="text-[10px] leading-4 text-neutral-500">Create or import a texture first.</p>
      ) : (
        <>
          <div className="mb-2 grid grid-cols-3 gap-1">
            {FACE_NAMES.map((f) => (
              <button
                key={f}
                onClick={() => setUvFace(f)}
                className={`flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] ${
                  face === f ? "bg-accent/20 text-accent" : "text-neutral-300 hover:bg-panel-2"
                }`}
              >
                <span
                  className="size-2 shrink-0 rounded-full"
                  style={{ backgroundColor: OVERLAY_COLORS[f] }}
                />
                {f}
              </button>
            ))}
          </div>
          {uv && face ? (
            <>
              <div className="grid grid-cols-2 gap-x-2 gap-y-1">
                {(["x1", "y1", "x2", "y2"] as const).map((label, i) => (
                  <NumField
                    key={`${cube.id}-${face}-${label}`}
                    label={label}
                    value={uv[i]}
                    onCommit={(n) => {
                      const next = [...uv] as FaceUV;
                      next[i] = n;
                      setFaceUV(cube.id, face, next, true);
                    }}
                  />
                ))}
              </div>
              <div className="mt-1.5 flex items-center gap-1.5">
                <span className="text-[10px] text-neutral-500">
                  {Math.abs(uv[2] - uv[0])}×{Math.abs(uv[3] - uv[1])} px
                </span>
                <button
                  onClick={() => setFaceUV(cube.id, face, flipUV(uv, "h"), true)}
                  title="Mirror this face horizontally"
                  className={`${btn} ml-auto py-0.5`}
                >
                  Flip H
                </button>
                <button
                  onClick={() => setFaceUV(cube.id, face, flipUV(uv, "v"), true)}
                  title="Mirror this face vertically"
                  className={`${btn} py-0.5`}
                >
                  Flip V
                </button>
              </div>
            </>
          ) : (
            <p className="text-[10px] leading-4 text-neutral-500">Pick a face to edit its UV.</p>
          )}
        </>
      )}
    </div>
  );
}

export default function TextureEditor() {
    const textureTool = useApp((state) => state.textureTool);
    const setTextureTool = useApp((state) => state.setTextureTool);
    const textures = useModel((s) => s.textures);
    const activeTexture = useModel((s) => s.activeTexture);
    const setActiveTexture = useModel((s) => s.setActiveTexture);
    const addTexture = useModel((s) => s.addTexture);
    const removeTexture = useModel((s) => s.removeTexture);
    const createTexture = useModel((s) => s.createTexture);

    const tex = activeTexture != null ? (textures[activeTexture] ?? null) : null;

    const importImage = async () => {
        const file = await openImageFile();
        if (file) addTexture({ source: file.dataUrl, name: file.name });
    };

    return (
        <main className="flex min-h-0 w-full flex-1 flex-row items-stretch">
            {/* Left: tools and 2D canvas */}
            <aside className="flex w-80 shrink-0 flex-col border-r border-border">
                <PanelTitle>TOOLS</PanelTitle>
                <div className="flex flex-wrap gap-1 px-2 pb-2">
                    {tools.map((tool) => (
                        <ToolButton
                            key={tool}
                            label={tool}
                            active={textureTool === tool}
                            onClick={() => setTextureTool(tool)}
                        />
                    ))}
                </div>
                
                <Divider />
                
                <div className="flex h-8 shrink-0 items-center border-b border-border bg-panel px-3 text-[11px] font-semibold tracking-widest text-neutral-500">
                    TEXTURE{tex ? <span className="ml-2 font-normal normal-case tracking-normal text-neutral-400">{tex.name}</span> : null}
                </div>
                
                {tex ? (
                    <PaintCanvas tex={tex} />
                ) : (
                    <div className="flex flex-1 flex-col items-center justify-center gap-3 p-4 text-center text-sm text-neutral-500">
                        <p>No textures yet.</p>
                        <div className="flex flex-col gap-2">
                            <button
                                onClick={importImage}
                                className="rounded bg-accent px-3 py-1.5 text-sm font-medium text-black hover:brightness-110"
                            >
                                Import image
                            </button>
                        </div>
                    </div>
                )}
            </aside>

            {/* Center: 3D preview with the painted texture */}
            <section className="flex min-h-0 min-w-0 flex-1 flex-col">
                <div className="flex h-8 shrink-0 items-center border-b border-border bg-panel px-3 text-[11px] font-semibold tracking-widest text-neutral-500">
                    3D PREVIEW
                </div>
                <div className="relative min-h-0 flex-1">
                    <EditorScene mode="texture" />
                </div>
            </section>

            {/* Right: texture list */}
            <aside className="flex w-64 shrink-0 flex-col border-l border-border">
                <PanelTitle>TEXTURES</PanelTitle>
                <div className="flex gap-1.5 px-2 pb-2">
                    <button
                        onClick={importImage}
                        title="Import an image as a new texture"
                        className="flex-1 rounded border border-border px-2 py-1 text-xs text-neutral-200 hover:bg-panel-2"
                    >
                        + Import
                    </button>
                    <button
                        onClick={() => createTexture(`texture-${textures.length + 1}`)}
                        title="Create a blank texture"
                        className="flex-1 rounded border border-border px-2 py-1 text-xs text-neutral-200 hover:bg-panel-2"
                    >
                        + New
                    </button>
                </div>
                <div className="min-h-[96px] flex-1 overflow-y-auto px-1 pb-2">
                    {textures.length === 0 && (
                        <p className="px-2 py-1 text-xs text-neutral-500">Nothing here yet.</p>
                    )}
                    {textures.map((t, i) => (
                        <div
                            key={`${t.name}-${i}`}
                            onClick={() => setActiveTexture(i)}
                            className={`mb-0.5 flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm transition-colors ${
                                activeTexture === i
                                    ? "bg-accent/20 text-accent"
                                    : "text-neutral-300 hover:bg-panel-2"
                            }`}
                        >
                            <img
                                src={t.source}
                                alt={t.name}
                                className="size-6 shrink-0 rounded-sm border border-border object-cover"
                                style={{ imageRendering: "pixelated" }}
                            />
                            <span className="truncate">{t.name}</span>
                            <span
                                role="button"
                                tabIndex={-1}
                                title="Remove texture"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    removeTexture(i);
                                }}
                                className="ml-auto shrink-0 rounded px-1 text-xs text-neutral-500 hover:bg-red-500/10 hover:text-red-400"
                            >
                                ✕
                            </span>
                        </div>
                    ))}
                </div>
                <UVPanel />
                {tex && (
                    <div className="border-t border-border p-2 text-[11px] leading-5 text-neutral-500">
                        <span className="font-medium text-neutral-300">{tex.name}</span>
                        <br />
                        active for painting &amp; new cubes
                    </div>
                )}
            </aside>
        </main>
    )
}