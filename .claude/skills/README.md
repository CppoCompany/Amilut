# Project skills

Project-scoped skills live here, one folder per skill containing a `SKILL.md`.

```
.claude/skills/
└── my-skill/
    └── SKILL.md      # frontmatter (name, description) + instructions
```

`SKILL.md` frontmatter:

```markdown
---
name: my-skill
description: When to trigger this skill.
---

Instructions / workflow for the skill.
```

Defined skills:

- `ui-verify/` — opens the running app in Chrome through the project-scoped
  `chrome-devtools` MCP server (`.mcp.json`) and verifies a screen or flow.
  Invoke with `/ui-verify` or ask to "verify the UI in the browser".

## Skills installed with the `skills` CLI

`npx skills add <owner/repo>` installs into `.agents/skills/` (tracked in
`skills-lock.json`), but Claude Code only discovers project skills under
`.claude/skills/`. After installing or updating a skill, copy its folder across:

```bash
cp -r .agents/skills/<name> .claude/skills/<name>
```

Then start a new Claude Code session (or run `/skills`) so the list refreshes.
Currently mirrored this way: `angular-best-practices-v20`, `angular-signals`,
`nest`, `design-taste-frontend`, `emil-design-eng`, `impeccable`,
`pick-ui-library`.
