# For LLMs

This documentation site publishes machine-readable files following the [llms.txt specification](https://llmstxt.org/).

## Available Endpoints

| File | Description |
|------|-------------|
| `/llms.txt` | Curated index of documentation pages |
| `/llms-full.txt` | All documentation in a single file — ideal for LLM context windows |
| Per-page `.md` files | Raw markdown available at the same URL path as each HTML page (e.g. `/getting-started/quickstart.md`) |

## Usage

### Quick context injection

```bash
# Fetch the full docs for an LLM prompt
curl https://ruvnet.github.io/ruflo/llms-full.txt
```

### Using the index

`/llms.txt` lists all pages with descriptions so an LLM can decide which sections are relevant before fetching the full content.

## About mkdocs-llms-source

These files are generated automatically by the [mkdocs-llms-source](https://github.com/TimChild/mkdocs-llms-source) plugin. They use the original markdown source (not HTML→markdown conversion), which means cleaner output and accurate code blocks.
