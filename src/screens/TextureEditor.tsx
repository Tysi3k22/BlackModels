import { useCallback, useEffect, useRef, useState } from "react";
import { PanelTitle, ToolButton, Divider } from "../components/Panel";
import { TextureTools, useApp } from "../constants";
import {
  FACE_NAMES,
  FaceName,
  ProjectTexture,
  selectFaceOverlay,
  useModel,
} from "../stores/modelStore";
import { openImageFile } from "../lib/files";

export default function TextureEditor() {
const tools: TextureTools[] = ["Brush", "Pencil", "Eraser", "Fill", "Picker"];

const toolCursor: Record<TextureTools, string> = {
  Brush: "crosshair",
  Pencil: "crosshair",
  Eraser: "cell",
  Fill: "crosshair",
  Picker: "copy",
};

const PALETTE = [
  "#000000", "#ffffff", "#9e2b25", "#da6c2c", "#e8c547",
  "#5d8c3a", "#3d6ea5", "#6f4e9c", "#8a5a44", "#7a7a7a",
];

const OVERLAY_COLORS: Record<FaceName, string> = {
  north: "#4ea1ff",
  east: "#ffd166",
  south: "#ef476f",
  west: "#06d6a0",
  up: "#a78bfa",
  down: "#f97316",
};

function rgbaOf(hex: string): [number, number, number, number] {
  const v = hex.replace("#", "");
  return [
    parseInt(v.slice(0, 2), 16),
    parseInt(v.slice(2, 4), 16),
    parseInt(v.slice(4, 6), 16),
    255,
  ];
}

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

/** Paintable 2D view of the active texture with UV face rects. */
function PaintCanvas({ tex }: { tex: ProjectTexture }) {
  const tool = useApp((s) => s.textureTool);
  const [color, setColor] = useState("#da6c2c");
  const [brushSize, setBrushSize] = useState(2);
  const commitTexturePixels = useModel((s) => s.commitTexturePixels);
  const overlay = useModel(selectFaceOverlay);
  const resolution = useModel((s) => s.resolution);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  // Pristine bitmap of the current texture; strokes paint on top of it.
  const pristine = useRef<HTMLImageElement | null>(null);
  const [ready, setReady] = useState(0);
  const stroke = useRef<{ last: [number, number] } | null>(null);

  const [resW, resH] = resolution;
  const fit = Math.min(512 / resW, 640 / resH, 4);
  const dispW = Math.round(resW * fit);
  const dispH = Math.round(resH * fit);

  // (Re)load the bitmap whenever the committed texture changes (also undo).
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

  // UV face rect overlay
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
      ctx.strokeStyle = OVERLAY_COLORS[face];
      ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);
      ctx.fillStyle = OVERLAY_COLORS[face];
      ctx.fillText(face, x1 + 3, Math.min(y1 + 13, resH - 3));
    }
  }, [overlay, ready, resW, resH]);

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

  const paintSquare = (ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number, erase: boolean) => {
    const half = Math.floor(size / 2);
    const x = cx - half;
    const y = cy - half;
    if (erase) ctx.clearRect(x, y, size, size);
    else {
      ctx.fillStyle = color;
      ctx.fillRect(x, y, size, size);
    }
  };

  const paintLine = (ctx: CanvasRenderingContext2D, from: [number, number], to: [number, number], size: number, erase: boolean) => {
    const dx = to[0] - from[0];
    const dy = to[1] - from[1];
    const steps = Math.max(Math.abs(dx), Math.abs(dy), 1);
    for (let i = 0; i <= steps; i++) {
      paintSquare(ctx, Math.round(from[0] + (dx * i) / steps), Math.round(from[1] + (dy * i) / steps), size, erase);
    }
  };

  const onDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!pristine.current) return;
    const hit = toPx(e);
    if (!hit) return;
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
      floodFillAt(ctx, hit[0], hit[1], color);
      commit();
      return;
    }
    stroke.current = { last: hit };
    paintSquare(ctx, hit[0], hit[1], tool === "Pencil" ? 1 : brushSize, tool === "Eraser");
  };

  const onMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!stroke.current || !pristine.current) return;
    const hit = toPx(e);
    if (!hit) return;
    const ctx = canvasRef.current!.getContext("2d")!;
    paintLine(ctx, stroke.current.last, hit, tool === "Pencil" ? 1 : brushSize, tool === "Eraser");
    stroke.current = { last: hit };
  };

  const onUp = () => {
    if (stroke.current) {
      stroke.current = null;
      commit();
    }
  };

  /** Send the canvas bitmap back to the store (one undo step per stroke). */
  const commit = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    commitTexturePixels(canvas.toDataURL("image/png"), { faces: overlayCubeUpdates(overlay) });
  };

  return (
    <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto p-4">
      <div className="flex flex-col items-center gap-2">
        <div className="relative" style={{ width: dispW, height: dispH }}>
          <canvas
            ref={canvasRef}
            width={resW}
            height={resH}
            style={{
              width: dispW,
              height: dispH,
              imageRendering: "pixelated",
              cursor: toolCursor[tool],
              background:
                "repeating-conic-gradient(#2a2c31 0% 25%, #1d1f23 0% 50%) 0 0 / 16px 16px",
            }}
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
          />
          <canvas
            ref={overlayRef}
            width={resW}
            height={resH}
            className="pointer-events-none absolute inset-0"
            style={{ width: dispW, height: dispH, imageRendering: "pixelated" }}
          />
        </div>
        <div className="text-[11px] text-neutral-500">
          {resW}×{resH} px ·{" "}
          {overlay
            ? overlay.kind === "cube"
              ? `painting ${overlay.name}`
              : "all faces view"
            : "no faces bound — select a cube in the Model tab or paint freely"}
          {tool === "Brush" && ` · size ${brushSize}`}
        </div>
        <div className="flex flex-wrap items-center justify-center gap-1">
          {PALETTE.map((c) => (
            <button
              key={c}
              onClick={() => setColor(c)}
              title={c}
              className={`size-5 rounded border ${
                color === c ? "border-accent ring-1 ring-accent" : "border-border"
              }`}
              style={{ backgroundColor: c }}
            />
          ))}
          <input
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            className="size-5 cursor-pointer rounded border border-border bg-transparent"
            title="Custom color"
          />
          <span className="mx-1 h-4 w-px bg-border" />
          {[1, 2, 4, 8].map((s) => (
            <button
              key={s}
              onClick={() => setBrushSize(s)}
              className={`rounded px-1.5 py-0.5 text-[11px] ${
                brushSize === s ? "bg-accent/20 text-accent" : "text-neutral-400 hover:bg-panel-2"
              }`}
            >
              {s}px
            </button>
          ))}
        </div>
      </div>
    </div>
  );

  /** Flood fill starting at (x, y) matching the exact source pixel. */
  function floodFillAt(ctx: CanvasRenderingContext2D, x: number, y: number, hex: string) {
    const img = ctx.getImageData(0, 0, resW, resH);
    const d = img.data;
    const start = (y * resW + x) * 4;
    const target = [d[start], d[start + 1], d[start + 2], d[start + 3]];
    const [nr, ng, nb, na] = rgbaOf(hex);
    if (target[0] === nr && target[1] === ng && target[2] === nb && target[3] === na) return;
    const seen = new Uint8Array(resW * resH);
    const stack: [number, number][] = [[x, y]];
    while (stack.length) {
      const [cx, cy] = stack.pop()!;
      if (cx < 0 || cy < 0 || cx >= resW || cy >= resH) continue;
      const idx = cy * resW + cx;
      if (seen[idx]) continue;
      seen[idx] = 1;
      const o = idx * 4;
      if (
        d[o] !== target[0] || d[o + 1] !== target[1] ||
        d[o + 2] !== target[2] || d[o + 3] !== target[3]
      )
        continue;
      d[o] = nr;
      d[o + 1] = ng;
      d[o + 2] = nb;
      d[o + 3] = na;
      stack.push([cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]);
    }
    ctx.putImageData(img, 0, 0);
  }
}
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
        <main className="flex h-full w-full flex-row items-stretch justify-start">
            <div id="leftContainer" className="flex w-1/8 min-w-44 flex-col">    
                <PanelTitle>Tools</PanelTitle>
                {
                    tools.map((tool) => (
                        <ToolButton
                            key={tool}
                            label={tool}
                            active={textureTool === tool}
                            onClick={() => setTextureTool(tool)}
                        />
                    ))
                }
                <Divider />
                <p className="px-3 py-2 text-[11px] leading-5 text-neutral-500">
                    Select a cube in the Model tab to paint just its faces, or
                    paint the whole texture freely. Every stroke is one undo step.
                </p>
            </div>


            <div id="middleContainer" className="flex min-h-0 w-full flex-col">
                {tex ? (
                    <PaintCanvas tex={tex} />
                ) : (
                    <div className="flex flex-1 flex-col items-center justify-center gap-3 text-sm text-neutral-500">
                        <p>No textures in this project yet.</p>
                        <div className="flex gap-2">
                            <button
                                onClick={importImage}
                                className="rounded bg-accent px-3 py-1.5 text-sm font-medium text-black hover:brightness-110"
                            >
                                Import image
                            </button>
                            <button
                                onClick={() => createTexture(`texture-${textures.length + 1}`)}
                                className="rounded border border-border px-3 py-1.5 text-sm text-neutral-200 hover:bg-panel-2"
                            >
                                New blank texture
                            </button>
                        </div>
                    </div>
                )}
            </div>

            <div id="rightContainer" className="flex w-1/8 min-w-44 flex-col">
                <PanelTitle>Textures</PanelTitle>
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
                <div className="min-h-0 flex-1 overflow-y-auto px-1 pb-2">
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
                {tex && (
                    <div className="border-t border-border p-2 text-[11px] leading-5 text-neutral-500">
                        <span className="font-medium text-neutral-300">{tex.name}</span>
                        <br />
                        active for painting &amp; new cubes
                    </div>
                )}
            </div>
        </main>
    )
} 