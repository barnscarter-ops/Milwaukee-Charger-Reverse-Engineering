# Working Rules

## Purpose

This is a documentation-first reverse-engineering project for a retired Milwaukee charger. The objective is understanding and evidence-backed documentation, not restoring or operating the charger.

## Safety boundary

- Keep the board unpowered while documenting, tracing, and photographing it.
- Do not provide or add instructions for mains-powered probing, bypassing protection, or operating the incomplete charger.
- Treat every circuit assertion as provisional until supported by a readable marking, a trace/continuity result, or a datasheet.
- Preserve isolation boundaries in diagrams. Mark primary-side and secondary-side nets clearly.

## Evidence rules

- Never overwrite original evidence photos.
- Put derived images, annotations, and cropped views in a new folder; retain the source filename in its caption or log entry.
- Record uncertainty explicitly. Use `confirmed`, `probable`, or `unknown` instead of guessing.
- Include source links and datasheet revision when identifying a part.

## Documentation style

- Use ASCII in text files.
- Keep documents short, structured, and dated.
- Name nets by function only after evidence supports the name. Before then, use neutral labels such as `NET-U1-3`.
- Add calculations with inputs, equation, units, and confidence level.

## Git workflow

- Make focused commits with an evidence-oriented message.
- Do not add unrelated firmware projects or generated editor files.
- Before committing, run `git diff --check` and review `git status --short`.
