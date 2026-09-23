# Issue tracker for local Markdown

Issues and specs for this repo live as Markdown files in `.scratch/`.

## Conventions

- One feature uses one directory at `.scratch/<feature-slug>/`.
- The spec is `.scratch/<feature-slug>/spec.md`.
- Implementation issues live at `.scratch/<feature-slug>/issues/<NN>-<slug>.md`.
- A `Status:` line near the top records the triage state.
- Comments and conversation history append under a `## Comments` heading.

## Publishing

When a skill says to publish to the issue tracker, create a file under `.scratch/<feature-slug>/`.

## Fetching

When a skill says to fetch a ticket, read the referenced local Markdown file.
