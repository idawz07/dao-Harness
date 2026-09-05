---
name: ops-playbook
description: Use when running builds, checks, or process diagnostics so ops work stays narrow and recoverable.
---

# Ops playbook

1. Prefer read-only diagnostics before mutating state.
2. Capture the exact command and exit code in the report.
3. Do not force-push, drop databases, or delete untracked work without explicit instruction.
4. Use background jobs for long-running processes; collect output before claiming success.
5. Stop failed jobs cleanly rather than leaving orphans.
