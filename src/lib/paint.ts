import { ProjectTexture } from "../stores/modelStore";

export function paintSquare(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number, erase: boolean, color: string) {
    const half = Math.floor(size / 2);
    const x = cx - half;
    const y = cy - half;
    if (erase) ctx.clearRect(x, y, size, size);
    else {
        ctx.fillStyle = color;
        ctx.fillRect(x, y, size, size);
    }
}

export function paintLine(ctx: CanvasRenderingContext2D, from: [number, number], to: [number, number], size: number, erase: boolean, color: string) {
    const dx = to[0] - from[0];
    const dy = to[1] - from[1];
    const steps = Math.max(Math.abs(dx), Math.abs(dy), 1);
    for (let i = 0; i <= steps; i++) {
        paintSquare(ctx, Math.round(from[0] + (dx * i) / steps), Math.round(from[1] + (dy * i) / steps), size, erase, color);
    }
}

/** Parse #rgb / #rgba / #rrggbb / #rrggbbaa into RGBA bytes. */
export function rgbaOf(hex: string): [number, number, number, number] {
    let v = hex.trim().replace(/^#/, "");
    if (v.length === 3 || v.length === 4) v = v.split("").map((c) => c + c).join("");
    if (v.length === 6) v += "ff";
    if (v.length !== 8 || /[^0-9a-f]/i.test(v)) return [0, 0, 0, 255];
    const n = parseInt(v, 16);
    return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
}

export function floodFillAt(ctx: CanvasRenderingContext2D, x: number, y: number, hex: string, resW: number, resH: number) {
    if (x < 0 || y < 0 || x >= resW || y >= resH) return;
    const img = ctx.getImageData(0, 0, resW, resH);
    const d = img.data;
    const start = (y * resW + x) * 4;
    const tr = d[start], tg = d[start + 1], tb = d[start + 2], ta = d[start + 3];
    const [nr, ng, nb, na] = rgbaOf(hex);
    if (tr === nr && tg === ng && tb === nb && ta === na) return;
    // Flat arrays instead of [x, y] tuples: a 1024x1024 fill would otherwise
    // allocate millions of tiny objects. Each pixel is pushed at most once.
    const seen = new Uint8Array(resW * resH);
    const stack = new Int32Array(resW * resH);
    let top = 0;
    const push = (idx: number) => {
        if (!seen[idx]) {
            seen[idx] = 1;
            stack[top++] = idx;
        }
    };
    const startIdx = y * resW + x;
    push(startIdx);
    while (top > 0) {
        const idx = stack[--top];
        const o = idx * 4;
        if (
            d[o] !== tr || d[o + 1] !== tg ||
            d[o + 2] !== tb || d[o + 3] !== ta
        )
            continue;
        d[o] = nr;
        d[o + 1] = ng;
        d[o + 2] = nb;
        d[o + 3] = na;
        const py = (idx / resW) | 0;
        const px = idx - py * resW;
        if (px > 0) push(idx - 1);
        if (px + 1 < resW) push(idx + 1);
        if (py > 0) push(idx - resW);
        if (py + 1 < resH) push(idx + resW);
    }
    ctx.putImageData(img, 0, 0);
}

export interface PaintWindow extends Window {
    __paintOffscreen?: HTMLCanvasElement;
}

// Keep a shared offscreen canvas and image for 3D painting
let offscreenCanvas: HTMLCanvasElement | null = null;
let offscreenCtx: CanvasRenderingContext2D | null = null;
let currentSource = "";
let currentRes = [0, 0];

export function getPaintContext(tex: ProjectTexture, resW: number, resH: number): Promise<CanvasRenderingContext2D> {
    return new Promise((resolve) => {
        if (!offscreenCanvas) {
            offscreenCanvas = document.createElement("canvas");
            offscreenCtx = offscreenCanvas.getContext("2d")!;
            (window as PaintWindow).__paintOffscreen = offscreenCanvas;
        }
        if (offscreenCanvas.width !== resW || offscreenCanvas.height !== resH) {
            offscreenCanvas.width = resW;
            offscreenCanvas.height = resH;
        }

        if (currentSource === tex.source && currentRes[0] === resW && currentRes[1] === resH) {
            resolve(offscreenCtx!);
            return;
        }

        const img = new Image();
        img.onload = () => {
            offscreenCtx!.clearRect(0, 0, resW, resH);
            offscreenCtx!.drawImage(img, 0, 0, resW, resH);
            currentSource = tex.source;
            currentRes = [resW, resH];
            resolve(offscreenCtx!);
        };
        img.src = tex.source;
    });
}
