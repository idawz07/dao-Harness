# AGENTS.md — Archived Agent Notes

Archived Agent Notes under the kind directories are frozen historical snapshots, not current authority. Never edit, reformat, repair, delete, or move a sealed artifact; use an active Agent Note or current documentation for new decisions and facts.

The archival change may only relocate the note, insert the `Archived: YYYY-MM-DD` line below the `Status: implemented` line, and repair or delete inbound links. Do not inspect, verify, or repair links out of archived notes.

Run the [`dao-archive-agent-notes`](../../skills/dao-archive-agent-notes/SKILL.md) workflow and append the new note's hash with `pnpm run verify-archived-agent-notes --write`. The normal verifier rejects changed or missing sealed artifacts, unknown kind folders, and invalid archive metadata.
