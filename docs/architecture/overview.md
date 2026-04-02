# Architecture Overview

Ruflo is structured in six layers, from user-facing interfaces down to LLM providers.

## System Diagram

```mermaid
flowchart TB
    subgraph User["👤 User Layer"]
        CC[Claude Code]
        CLI[CLI Commands]
    end

    subgraph Orchestration["🎯 Orchestration Layer"]
        MCP[MCP Server]
        Router[Intelligent Router]
        Hooks[Self-Learning Hooks]
    end

    subgraph Agents["🤖 Agent Layer"]
        Queen[Queen Coordinator]
        Workers[60+ Specialized Agents]
        Swarm[Swarm Manager]
    end

    subgraph Intelligence["🧠 Intelligence Layer"]
        SONA[SONA Learning]
        MoE[Mixture of Experts]
        HNSW[HNSW Vector Search]
    end

    subgraph Providers["☁️ Provider Layer"]
        Anthropic[Anthropic]
        OpenAI[OpenAI]
        Google[Google]
        Ollama[Ollama]
    end

    CC --> MCP
    CLI --> MCP
    MCP --> Router
    Router --> Hooks
    Hooks --> Queen
    Queen --> Workers
    Queen --> Swarm
    Workers --> Intelligence
    Intelligence --> Providers
```

## Layers Explained

### User Layer
Entry points: **Claude Code** (interactive) and the **Ruflo CLI** for direct commands.

### Orchestration Layer
- **MCP Server** — exposes 259 tools to any MCP-compatible client
- **Intelligent Router** — Q-Learning based routing with 89% accuracy; dispatches to WASM, agent, or swarm
- **Self-Learning Hooks** — pre/post/progress lifecycle hooks that learn from every execution

### Agent Layer
- **Queen Coordinator** — strategic, tactical, and adaptive queens that manage and validate agent output
- **60+ Specialized Agents** — coder, tester, reviewer, architect, security, documenter, and more
- **Swarm Manager** — coordinates topology (hierarchical/mesh/ring/star) and consensus (Raft/BFT/Gossip)

### Intelligence Layer
- **SONA** — Self-Optimizing Neural Architecture; learns routing from outcomes in <0.05ms
- **Mixture of Experts (MoE)** — 8 expert networks with dynamic gating for task classification
- **HNSW Vector Search** — sub-millisecond pattern retrieval; 150x–12,500x faster than linear scan

### Memory Layer
See [Intelligence & Memory](memory.md) for the full breakdown.

### Provider Layer
Supports **6 LLM providers** with automatic failover and cost-based routing:
Anthropic · OpenAI · Google · Cohere · Groq · Ollama (local)

---

## Request Flow

```mermaid
sequenceDiagram
    participant U as User
    participant R as Router
    participant H as Hooks
    participant A as Agent Pool
    participant M as Memory
    participant P as Provider

    U->>R: Submit Task
    R->>H: pre-task hook
    H->>H: Analyze complexity

    alt Simple Task
        H->>A: Agent Booster (WASM)
        A-->>U: Result (<1ms)
    else Medium Task
        H->>A: Spawn Haiku Agent
        A->>M: Check patterns
        M-->>A: Cached context
        A->>P: LLM Call
        P-->>A: Response
        A->>H: post-task hook
        H->>M: Store patterns
        A-->>U: Result
    else Complex Task
        H->>A: Spawn Swarm
        A->>A: Coordinate agents
        A->>P: Multiple LLM calls
        P-->>A: Responses
        A->>H: post-task hook
        A-->>U: Result
    end
```

## Domain-Driven Design

Ruflo is organized into 5 bounded contexts that prevent cross-domain pollution:

```
┌─────────────┐  ┌─────────────┐  ┌─────────────┐
│    Core     │  │   Memory    │  │  Security   │
│  Agents,    │  │  AgentDB,   │  │  AIDefence, │
│  Swarms,    │  │  HNSW,      │  │  Validation │
│  Tasks      │  │  Cache      │  │  CVE Fixes  │
└─────────────┘  └─────────────┘  └─────────────┘
┌─────────────┐  ┌─────────────┐
│ Integration │  │Coordination │
│ agentic-    │  │  Consensus, │
│ flow, MCP   │  │  Hive-Mind  │
└─────────────┘  └─────────────┘
```
