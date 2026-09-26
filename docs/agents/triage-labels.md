# Triage Labels

The skills speak in terms of five canonical triage roles. This file maps those roles to the actual label strings used in this repo's issue tracker.

| Label in mattpocock/skills | Label in our tracker | Meaning                                  |
| -------------------------- | -------------------- | ---------------------------------------- |
| `needs-triage`             | `needs-triage`       | Maintainer needs to evaluate this issue  |
| `needs-info`               | `needs-info`         | Waiting on reporter for more information |
| `ready-for-agent`          | `ready-for-agent`    | Fully specified, ready for an AFK agent  |
| `ready-for-human`          | `ready-for-human`    | Requires human implementation            |
| `closed`                   | `closed`             | Work completed, verified and merged      |
| `wontfix`                  | `wontfix`            | Will not be actioned                     |

When a skill mentions a role (e.g. "apply the AFK-ready triage label"), use the corresponding label string from this table.

Edit the right-hand column to match whatever vocabulary you actually use.

## Visual checks

A pending "conferência visual em navegador" is agent work, not a reason for `ready-for-human`:

1. Drive the app with Playwright at 1400×900, and also at 360px wide when the ticket covers mobile. Install `playwright-core` outside the app, in your scratchpad, and point it at the preinstalled Chromium. For a long page, capture a tall viewport scrolled to the top: a full-page capture taken after scrolling shifts the sticky sidebar.
2. Save the screenshots as JPEG in `.scratch/<feature-slug>/issues/prints/<NN>-<view>.jpg`.
3. Link them in the ticket's `## Comments`, then close the ticket.

Keep `ready-for-human` for what only a person can do: a real screen reader, a real Google sign-in or Turnstile, third-party accounts, and product decisions.
