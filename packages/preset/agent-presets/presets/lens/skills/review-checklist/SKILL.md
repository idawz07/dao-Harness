---
name: review-checklist
description: Use when reviewing a diff, plan, or prior session for defects, missing tests, or contract breaks.
---

# Review checklist

1. Correctness: does the change do what it claims?
2. Contracts: public APIs, schemas, session events, and error paths.
3. Tests: is the new behavior covered at the right layer?
4. Safety: auth, sandbox, secrets, and destructive operations.
5. Report: severity, path, evidence, and a fix suggestion — no silent drive-by edits.
