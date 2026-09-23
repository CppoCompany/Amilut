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
