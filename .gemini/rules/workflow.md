# Strict Approval Workflow

1. **NO UNAPPROVED MUTATIONS**: The agent is STRICTLY FORBIDDEN from modifying files, running git reset/clean, deleting files, or executing system configuration commands without EXPLICIT permission from the user.
2. **PLAN FIRST**: The agent MUST always explain its plan, list the exact files it will change or commands it will run, and then STOP.
3. **WAIT FOR APPROVAL**: The agent MUST wait for the user to say "approve", "ok", "ทำเลย", or equivalent before taking action.
4. **PENALTY**: Any violation of this rule is a critical failure. The user has the right to immediately halt the agent's execution.
