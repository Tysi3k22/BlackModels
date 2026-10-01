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
import { EditorScene } from "../components/Viewport";

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

function PaintCanvas({ tex }: { tex: ProjectTexture }) {
  const tool = useApp((s) => s.textureTool);
  const color = useApp((s) => s.textureColor);
  const setColor = useApp((s) => s.setTextureColor);
  const brushSize = useApp((s) => s.textureBrushSize);
  const setBrushSize = useApp((s) => s.setTextureBrushSize);
  const commitTexturePixels = useModel((s) => s.commitTexturePixels);
  const overlay = useModel(selectFaceOverlay);
  const resolution = useModel((s) => s.resolution);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const pristine = useRef<HTMLImageElement | null>(null);
  const [ready, setReady] = useState(0);
  const stroke = useRef<{ last: [number, number] } | null>(null);

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
      floodFillAt(ctx, hit[0], hit[1], color, resW, resH);
      commit();
      return;
    }
    stroke.current = { last: hit };
    paintSquare(ctx, hit[0], hit[1], tool === "Pencil" ? 1 : brushSize, tool === "Eraser", color);
  };

  const onMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!stroke.current || !pristine.current) return;
    const hit = toPx(e);
    if (!hit) return;
    const ctx = canvasRef.current!.getContext("2d")!;
    paintLine(ctx, stroke.current.last, hit, tool === "Pencil" ? 1 : brushSize, tool === "Eraser", color);
    stroke.current = { last: hit };
  };

  const onUp = () => {
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
            />
            <canvas
              ref={overlayRef}
              width={resW}
              height={resH}
              className="pointer-events-none absolute inset-0"
              style={{ width: dispW, height: dispH, imageRendering: "pixelated" }}
            />
          </div>
        </div>
      </div>

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
            <aside className="flex w-52 shrink-0 flex-col border-l border-border">
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
            </aside>
        </main>
    )
}