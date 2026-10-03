import * as THREE from "three";

/**
 * Shared THREE.Texture cache keyed by stable texture id. The same THREE.Texture
 * is reused and its image swapped in place when the source changes, so painting
 * does not reload textures. Lives outside the store so the store stays pure.
 *
 * Ids (not array indices) are the key: deleting a texture never shifts another
 * texture's cache entry, and faces keep pointing at the same texture.
 */
const cache = new Map<string, { tex: THREE.Texture; source: string }>();

export function getSharedTexture(source: string, id?: string | null): THREE.Texture | null {
  if (id != null) {
    const cached = cache.get(id);
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
    if (id != null) cache.set(id, { tex: t, source });
    return t;
  } catch {
    return null;
  }
}

/** Push a canvas bitmap into the live THREE texture so strokes appear instantly. */
export function flushCanvasToLiveTexture(textureId: string, canvas?: HTMLCanvasElement | null) {
  const cached = cache.get(textureId);
  if (!cached || !canvas) return;
  cached.tex.image = canvas;
  cached.tex.needsUpdate = true;
}

/** Dispose the texture with this id. Other entries are untouched. */
export function disposeTexture(textureId: string) {
  cache.get(textureId)?.tex.dispose();
  cache.delete(textureId);
}

/** Dispose everything — called when a whole project is replaced. */
export function clearTextureCache() {
  for (const { tex } of cache.values()) tex.dispose();
  cache.clear();
}
