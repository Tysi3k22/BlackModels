# BlockForge AI

> **AI-powered Minecraft model editor and asset creation platform.**

BlockForge AI is a next-generation 3D editor designed specifically for creating, editing, animating, and managing Minecraft models.

The goal of BlockForge AI is to combine the flexibility of traditional Minecraft model editors with modern AI-assisted workflows.

Instead of manually creating every cube, bone, animation, and texture, users will be able to describe what they want in natural language and let AI assist with the creation and modification of their models.

---

## Features

### Minecraft Model Editor

A dedicated 3D editor built specifically for Minecraft models.

* Cube-based modeling
* Bone and bone hierarchy support
* Move, rotate, and scale tools
* Pivot point editing
* Outliner
* Object selection
* Minecraft coordinate system
* Grid and snapping
* Model hierarchy
* Undo / Redo
* Project saving and loading

---

### `.bbmodel` Support

BlockForge AI is designed to support the Blockbench `.bbmodel` format.

The internal editor uses its own model representation and converts it to/from `.bbmodel`.

```text
BlockForge Model
       │
       ├── Import ──► .bbmodel
       │
       └── Export ──► .bbmodel
```

This allows BlockForge projects to remain independent from a single external format.

---

### Minecraft Ecosystem

Planned export support includes:

* Blockbench `.bbmodel`
* Minecraft Resource Packs
* ModelEngine
* ItemsAdder
* Nexo
* MythicMobs
* Custom Minecraft assets

The long-term goal is to allow users to go from:

```text
Idea
  ↓
AI
  ↓
3D Model
  ↓
Animation
  ↓
Texture
  ↓
Minecraft Asset
  ↓
Resource Pack / Plugin
```

---

# Technology Stack

## Frontend

* **React**
* **TypeScript**
* **Three.js**
* **React Three Fiber**
* **@react-three/drei**
* **Zustand**
* **Tailwind CSS**
* **shadcn/ui**

## Desktop

* **Tauri 2**
* **Rust**

## Backend

* **Python**
* **FastAPI**
* **Pydantic**

## AI

* OpenAI API
* Structured Outputs / Tool Calling
* Retrieval-Augmented Generation (RAG)
* Qdrant
* PyTorch for future specialized models

## Data

* PostgreSQL
* Redis
* S3-compatible object storage

---

# Development Roadmap

## Phase 1 — Core Editor

* [x] Tauri desktop application
* [x] React + TypeScript setup
* [x] Three.js viewport
* [x] Minecraft grid
* [x] Camera controls
* [x] Cube creation
* [x] Cube deletion
* [x] Object selection
* [x] Move / Rotate / Scale
* [x] Outliner
* [x] Undo / Redo
* [x] Project save/load

## Phase 2 — Minecraft Modeling

* [x] Bones
* [x] Bone hierarchy
* [x] Parenting
* [x] Pivot points
* [x] Textures
* [x] UV mapping
* [ ] Materials
* [ ] Minecraft-specific constraints

## Phase 3 — Blockbench Compatibility

* [x] `.bbmodel` importer
* [x] `.bbmodel` exporter
* [ ] Model validation
* [ ] Version compatibility

## Phase 4 — Animation

* [ ] Timeline
* [ ] Keyframes
* [ ] Animation editor
* [ ] Animation preview
* [ ] Animation import/export
* [ ] AI animation generation

## Phase 5 — AI

* [ ] AI assistant
* [ ] Natural language model editing
* [ ] Structured AI commands
* [ ] AI model generation
* [ ] AI animation generation
* [ ] AI texture generation
* [ ] Model analysis
* [ ] AI generation history

## Phase 6 — Minecraft Integration

* [ ] Resource Pack generator
* [ ] ModelEngine exporter
* [ ] ItemsAdder exporter
* [ ] Nexo exporter
* [ ] MythicMobs integration
* [ ] Server project management

## Phase 7 — Advanced AI

* [ ] User model library
* [ ] Model embeddings
* [ ] RAG
* [ ] Similar model search
* [ ] AI style matching
* [ ] Optional local AI
* [ ] Specialized Minecraft model generation

---

# Getting Started

> Development setup is currently under construction.

### Requirements

* Node.js LTS
* Rust
* Git
* Python 3.12+
* npm

### Clone the repository

```bash
git clone https://github.com/your-username/BlockForgeAI.git
cd BlockForgeAI
```

### Install frontend dependencies

```bash
npm install
```

### Start the development application

```bash
npm run tauri dev
```

---

# Long-Term Vision

The long-term goal of BlockForge AI is to create a complete AI-assisted Minecraft asset creation environment.

Instead of switching between multiple programs:

```text
Modeling Software
       ↓
Blockbench
       ↓
Texture Editor
       ↓
Animation Editor
       ↓
Resource Pack
       ↓
Minecraft Plugins
```

BlockForge aims to provide a unified workflow:

```text
                         BLOCKFORGE AI

                              │
                              ▼
                           PROMPT
                              │
               ┌──────────────┼──────────────┐
               ▼              ▼              ▼
             MODEL         TEXTURE       ANIMATION
               │              │              │
               └──────────────┼──────────────┘
                              ▼
                         ASSET PROJECT
                              │
                ┌─────────────┼─────────────┐
                ▼             ▼             ▼
             BBModel      Resource Pack   Plugins
                │             │             │
                └─────────────┼─────────────┘
                              ▼
                           MINECRAFT
```

---

# License

MIT License 

---

# Project Status

**Early Development**

BlockForge AI is currently in the architectural and prototyping stage.

The project is actively being designed around a modular core so that the editor, AI system, Minecraft integrations, and future web platform can evolve independently.

---

## Contributing

Contributions, ideas, bug reports, and feature suggestions will be welcome once the project reaches a public development stage.

If you are interested in the project, feel free to follow its development and contribute ideas for:

* Minecraft modeling
* AI-assisted workflows
* Animation systems
* Resource pack generation
* Minecraft plugin integrations
* 3D editor technology
