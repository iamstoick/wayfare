# AGENTS.md

## Argus codebase index (MCP)

This project is indexed by [Argus](https://github.com/iamstoick/argus)
(`argus` MCP server, root: this directory).

- Before generating any new function, utility, module, or class, you MUST
  call the `lookup_dictionary` MCP tool to check if equivalent or reusable
  code already exists in the project.
- Use `mode: "hybrid"` when exploring (typo-tolerant + semantic matches);
  default `exact` mode is enough when you know the name.
- Never scan raw project files using shell commands (`cat`, `grep`, `find`)
  unless explicitly requested for inline editing.
- Use `get_symbol_details` to read a symbol's source, `check_blast_radius`
  before refactoring, and `find_duplicates` / `find_dead_code` when
  cleaning up.

## Project

SpotHop travel-itinerary PWA. `backend/` = Express + Prisma API (`npm run dev`,
port 5001). `frontend/` = React + Vite + Leaflet PWA (`npm run dev`, port
5173). Full stack: `docker compose up --build`, web on
http://localhost:4445. Never commit `.env` files.
