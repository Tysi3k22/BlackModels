import { Cube, ProjectTexture, useModel } from "../stores/modelStore";
import { openTextFile, saveTextFile } from "./files";
import { pushRecent } from "./recent";
import { parseBbmodel } from "./bbmodel";

const PROJECT_EXTENSION = "bmproj";
const PROJECT_FILTER_NAME = "BlackModels Project";
const PROJECT_FILTER = {
  name: PROJECT_FILTER_NAME,
  extensions: [PROJECT_EXTENSION],
};

export interface ProjectFile {
  version: 2;
  app: "blackmodels";
  name: string;
  resolution: [number, number];
  textures: ProjectTexture[];
  cubes: Cube[];
}

export function serializeProject(): string {
  const { name, cubes, textures, resolution } = useModel.getState();
  const project: ProjectFile = {
    version: 2,
    app: "blackmodels",
    name,
    resolution,
    textures,
    cubes,
  };
  return JSON.stringify(project, null, 2);
}

export function parseProject(json: string): {
  name: string;
  cubes: Cube[];
  textures: ProjectTexture[];
  resolution: [number, number];
} {
  const data = JSON.parse(json) as ProjectFile;
  if (!data || data.app !== "blackmodels" || !Array.isArray(data.cubes)) {
    throw new Error("Not a valid BlackModels project file");
  }
  if (data.version !== 2) {
    throw new Error(`Unsupported project version: ${data.version}`);
  }
  for (const c of data.cubes) {
    if (
      typeof c.id !== "string" ||
      typeof c.name !== "string" ||
      !Array.isArray(c.from) ||
      !Array.isArray(c.to)
    ) {
      throw new Error("Corrupted cube entry in project file");
    }
  }
  return {
    name: data.name ?? "Untitled",
    cubes: data.cubes,
    textures: data.textures ?? [],
    resolution: data.resolution ?? [256, 256],
  };
}

/** Opens a model file (.bmproj or .bbmodel) and loads it into the store. */
export async function openModelFile(): Promise<
  "ok" | "cancelled" | "error"
> {
  try {
    const file = await openTextFile([
      { name: "Model (bbmodel / bmproj)", extensions: ["bbmodel", "bmproj"] },
    ]);
    if (!file) return "cancelled";
    return applyModelFile(file.contents, file.name);
  } catch (e) {
    console.error("Failed to open model file", e);
    return "error";
  }
}

/** Parses a model file's contents and loads it; records it in Recent. */
export function applyModelFile(
  contents: string,
  fileName?: string
): "ok" | "error" {
  try {
    let data: {
      name: string;
      cubes: Cube[];
      textures: ProjectTexture[];
      resolution: [number, number];
    };
    let format: "bbmodel" | "bmproj";
    if (fileName?.endsWith(".bmproj")) {
      data = parseProject(contents);
      format = "bmproj";
    } else if (fileName?.endsWith(".bbmodel")) {
      data = parseBbmodel(contents);
      format = "bbmodel";
    } else {
      // Detect by content
      const probe = JSON.parse(contents) as {
        app?: string;
        meta?: unknown;
        elements?: unknown;
        cubes?: unknown;
      };
      if (probe.meta && probe.elements) {
        data = parseBbmodel(contents);
        format = "bbmodel";
      } else if (probe.cubes) {
        data = parseProject(contents);
        format = "bmproj";
      } else {
        throw new Error("Unrecognized file format");
      }
    }
    useModel.getState().importProject(data);
    pushRecent({ name: data.name, format, data: contents });
    return "ok";
  } catch (e) {
    console.error("Failed to parse model file", e);
    return "error";
  }
}

export async function saveProject(): Promise<boolean> {
  const { name } = useModel.getState();
  const safeName = (name || "project").replace(/[^\w\- ]+/g, "_");
  const contents = serializeProject();
  const saved = await saveTextFile({
    defaultName: `${safeName}.${PROJECT_EXTENSION}`,
    filters: [PROJECT_FILTER],
    contents,
  });
  if (saved) {
    pushRecent({ name, format: "bmproj", data: contents });
  }
  return saved;
}

export function newProject(): void {
  useModel.getState().importProject({
    name: "Untitled",
    cubes: [],
    textures: [],
    resolution: [256, 256],
  });
}
