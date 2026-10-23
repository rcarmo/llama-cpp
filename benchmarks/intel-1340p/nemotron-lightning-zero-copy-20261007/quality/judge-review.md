# Independent scoring review

Delegate: github-copilot/mai-code-1.1-flash, task_category judge. Input was compact frozen prompts/expected answers, CPU/handoff outputs for LRU/policy/conflicts and actual CPU LRU exception. No inference rerun or GPU work. Delegate completed successfully.

- Policy expected answer is fair: A,B,F approved and total135; C missing receipt, D alcohol, E late. Manager exception waives deadline only. No score change.
- Conflicting-source expected answer is fair: Windows offline and disabling encryption must be unknown given explicit no-precedence instruction, Android unknown. No score change.
- CPU LRU is broken: node key is never assigned, eviction deletes undefined map key, stale nodes stay in map and later movement dereferences nulled prev/next. Runtime failure is functional, not a merely subjective complexity judgement.
- Handoff Map insertion-order LRU is acceptable and average O(1) for this prompt; built-in Map is permitted, delete/set moves existing keys and deleting first key evicts least recent.

This review supports these specific scoring decisions, not broad model quality or independently verified infrastructure/runtime qualification.
