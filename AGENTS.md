# Local skills

When the user asks which skills are available, what this repository can do with its skills, or to list local skills, look at `.agents/skills/` on disk. Do not answer from a list written in this file.

1. List the directories in `.agents/skills/`.
2. Read the YAML frontmatter of each `SKILL.md` in those directories.
3. Report every skill whose frontmatter has a `name` and a `description`. Skip a directory that has no `SKILL.md`.

Invoke a skill by the `name` in that frontmatter. Read that skill's `SKILL.md` before following it.
