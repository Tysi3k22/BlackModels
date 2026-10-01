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

function rgbaOf(hex: string): [number, number, number, number] {
    const v = hex.replace("#", "");
    return [
        parseInt(v.slice(0, 2), 16),
        parseInt(v.slice(2, 4), 16),
        parseInt(v.slice(4, 6), 16),
        255,
    ];
}

export function floodFillAt(ctx: CanvasRenderingContext2D, x: number, y: number, hex: string, resW: number, resH: number) {
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
            (window as any).__paintOffscreen = offscreenCanvas;
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
