import * as THREE from "three";

/**
 * Shared THREE.Texture cache keyed by texture index. The same THREE.Texture is
 * reused and its image swapped in place when the source changes, so painting
 * does not reload textures. Lives outside the store so the store stays pure.
 */
const cache = new Map<number, { tex: THREE.Texture; source: string }>();

export function getSharedTexture(source: string, index?: number): THREE.Texture | null {
  if (index != null) {
    const cached = cache.get(index);
    if (cached) {
      if (cached.source !== source) {
        const img = new Image();
        img.onload = () => {
          cached.tex.image = img;
          cached.tex.needsUpdate = true;
        };
        img.src = source;
        cached.source = source;
      }
      return cached.tex;
    }
  }
  try {
    const t = new THREE.TextureLoader().load(source);
    t.magFilter = THREE.NearestFilter;
    t.minFilter = THREE.NearestFilter;
    t.colorSpace = THREE.SRGBColorSpace;
    if (index != null) cache.set(index, { tex: t, source });
    return t;
  } catch {
    return null;
  }
}

/** Push a canvas bitmap into the live THREE texture so strokes appear instantly. */
export function flushCanvasToLiveTexture(textureIndex: number, canvas?: HTMLCanvasElement | null) {
  const cached = cache.get(textureIndex);
  if (!cached || !canvas) return;
  cached.tex.image = canvas;
  cached.tex.needsUpdate = true;
}

/**
 * Dispose the texture at `index` and shift every higher index down by one,
 * mirroring `textures.filter((_, i) => i !== index)` in the store.
 */
export function disposeTexture(index: number) {
  cache.get(index)?.tex.dispose();
  cache.delete(index);
  const higher = [...cache.keys()].filter((k) => k > index).sort((a, b) => a - b);
  for (const k of higher) {
    cache.set(k - 1, cache.get(k)!);
    cache.delete(k);
  }
}
