# Domain Docs

How engineering skills should consume this repo's domain documentation.

## Before exploring, read these

- `GLOSSARY.md` at the repo root, or `GLOSSARY-MAP.md` if it exists.
- Relevant ADRs in `docs/adr/`. In a multi-context repo, also check `src/<context>/docs/adr/`.

If these files don't exist, proceed without treating their absence as a blocker. Create them when domain terms or decisions are actually resolved.

## File structure

This repo uses the single-context layout:

- `GLOSSARY.md` at the root.
- System-wide decisions in `docs/adr/`.

## Use the glossary's vocabulary

Use terms as defined by the glossary in issue titles, refactor proposals, hypotheses, and test names. If a needed concept is missing, reconsider the terminology or record the gap for domain modeling.

## Flag ADR conflicts

Surface any conflict with an existing ADR rather than silently overriding it.
