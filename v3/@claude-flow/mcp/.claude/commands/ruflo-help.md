---
name: ruflo-help
description: Show Claude-Flow commands and usage
---

# Claude-Flow Commands

## 🌊 Claude-Flow: Agent Orchestration Platform

Claude-Flow is the ultimate multi-terminal orchestration platform that revolutionizes how you work with Claude Code.

## Core Commands

### 🚀 System Management
- `./ruflo start` - Start orchestration system
- `./ruflo start --ui` - Start with interactive process management UI
- `./ruflo status` - Check system status
- `./ruflo monitor` - Real-time monitoring
- `./ruflo stop` - Stop orchestration

### 🤖 Agent Management
- `./ruflo agent spawn <type>` - Create new agent
- `./ruflo agent list` - List active agents
- `./ruflo agent info <id>` - Agent details
- `./ruflo agent terminate <id>` - Stop agent

### 📋 Task Management
- `./ruflo task create <type> "description"` - Create task
- `./ruflo task list` - List all tasks
- `./ruflo task status <id>` - Task status
- `./ruflo task cancel <id>` - Cancel task
- `./ruflo task workflow <file>` - Execute workflow

### 🧠 Memory Operations
- `./ruflo memory store "key" "value"` - Store data
- `./ruflo memory query "search"` - Search memory
- `./ruflo memory stats` - Memory statistics
- `./ruflo memory export <file>` - Export memory
- `./ruflo memory import <file>` - Import memory

### ⚡ SPARC Development
- `./ruflo sparc "task"` - Run SPARC orchestrator
- `./ruflo sparc modes` - List all 17+ SPARC modes
- `./ruflo sparc run <mode> "task"` - Run specific mode
- `./ruflo sparc tdd "feature"` - TDD workflow
- `./ruflo sparc info <mode>` - Mode details

### 🐝 Swarm Coordination
- `./ruflo swarm "task" --strategy <type>` - Start swarm
- `./ruflo swarm "task" --background` - Long-running swarm
- `./ruflo swarm "task" --monitor` - With monitoring
- `./ruflo swarm "task" --ui` - Interactive UI
- `./ruflo swarm "task" --distributed` - Distributed coordination

### 🌍 MCP Integration
- `./ruflo mcp status` - MCP server status
- `./ruflo mcp tools` - List available tools
- `./ruflo mcp config` - Show configuration
- `./ruflo mcp logs` - View MCP logs

### 🤖 Claude Integration
- `./ruflo claude spawn "task"` - Spawn Claude with enhanced guidance
- `./ruflo claude batch <file>` - Execute workflow configuration

## 🌟 Quick Examples

### Initialize with SPARC:
```bash
npx -y claude-flow@latest init --sparc
```

### Start a development swarm:
```bash
./ruflo swarm "Build REST API" --strategy development --monitor --review
```

### Run TDD workflow:
```bash
./ruflo sparc tdd "user authentication"
```

### Store project context:
```bash
./ruflo memory store "project_requirements" "e-commerce platform specs" --namespace project
```

### Spawn specialized agents:
```bash
./ruflo agent spawn researcher --name "Senior Researcher" --priority 8
./ruflo agent spawn developer --name "Lead Developer" --priority 9
```

## 🎯 Best Practices
- Use `./claude-flow` instead of `npx claude-flow` after initialization
- Store important context in memory for cross-session persistence
- Use swarm mode for complex tasks requiring multiple agents
- Enable monitoring for real-time progress tracking
- Use background mode for tasks > 30 minutes

## 📚 Resources
- Documentation: https://github.com/ruvnet/claude-code-flow/docs
- Examples: https://github.com/ruvnet/claude-code-flow/examples
- Issues: https://github.com/ruvnet/claude-code-flow/issues
