---
name: session-close
description: Close out a work session on Peripheral — verification gate, roadmap sync, changelog, lessons, memory, commit, and a derived handoff. Use when Ricky says /session-close, "let's wrap up", "close out the session", "end of session", or otherwise signals the session is ending. Also use before a long gap in work, or before handing the project to a cold start.
---

# Peripheral — Session Close

Adapted from Drywater's `session-close` command, 2026-08-17. The skeleton is
the same because it works: a blocking gate first, then documentation in a fixed
order, then commit, then a handoff written for a cold reader. What changed is
everything downstream of "what does shipping mean here" — Peripheral has no
release channels, a private repo, and one user. Its equivalents are different
and are called out where they diverge.

**Step 0 is a gate.** Do it first, present it, and STOP until Ricky answers.
Then execute Steps 1–8 in order. Do not skip steps. Do not reorder Steps 3 and
7 — see the note there.

---

## Step 0 — Verification Gate (BLOCKING)

Drywater asks "which channels do we ship to." Peripheral has no channels: the
repo is private until Sprint 3 and there is exactly one user. **Its equivalent
question is what was actually verified, and by what method** — because this
project's most expensive recurring mistake is recording a claim stronger than
the evidence behind it.

The standing rules that make this a gate rather than a formality:

- **"Accepted" is not "displayed."** Transport success proves bytes moved. It
  has never proved a pixel changed.
- **Green metrics are not evidence.** `29/29 pushes, 0 failures` describes the
  daemon's opinion of itself.
- **Ricky validates by using the thing on the real device.** A screenshot
  through the renderer is closer than a metric and is still not the glass.

Classify **every claim this session wants to put in the changelog** into one of
these, and say which:

| Tier | What it means | Example |
|---|---|---|
| **Seen on the glass** | Ricky looked at the panel and reported | "the blue is too light" |
| **Rendered** | Captured as a JPEG through `src/render.js` and read | layout fits 480px |
| **Measured** | A number from a script or the daemon log | 4.67:1 contrast, 30 pushes/30s |
| **Tested** | `npm test` covers it | the normaliser drops declined invites |
| **Written only** | Code exists, nothing exercised it | a provider that never made a network call |

Output format:

```
## Verification status

**Seen on the glass:** <what Ricky actually confirmed, or "nothing this session">
**Rendered / measured / tested:** <one line each, or omit the empty ones>
**Written but unverified:** <the honest list — this is the important one>
**Claims I am NOT making:** <anything a reader might otherwise infer>
```

Then ask: **"Anything you saw on the panel that I should record before I write
this up?"**

**Wait for the answer.** He may have noticed something the daemon reported as
healthy — that is exactly the information this gate exists to capture, and it
is worthless once the changelog is already written. If he says nothing was
looked at, that is a fine answer: record "not verified by eye" and move on.

---

## Step 1 — Git status and secret scan

Run `git status` and `git diff`. List uncommitted changes. Then:

**Scan for anything that must never be committed.** `.env` holds a real Google
client secret and is gitignored; the token store and state cache live in
`%LOCALAPPDATA%\Peripheral\` deliberately, outside the repo.

```bash
git add -A && git diff --cached | grep -nE 'GOOGLE_CLIENT_SECRET=.+|GOCSPX-|refresh_token"?\s*[:=]\s*"[A-Za-z0-9_-]{10}' || echo clean
```

**This repo goes public in Sprint 3.** Treat every commit as though it already
is — history is not cleaned later, and a secret in an old commit survives the
repo going public whether or not the file still exists.

Also confirm: **`web/tokens.css` is generated.** If it changed, it must have
changed via `npm run palette`, not by hand.

## Step 2 — Roadmap sync

Read `directives/roadmap.md`. Mark completed items `- [x]`. Do not mark an item
complete unless it was fully finished **and verified at the tier claimed in
Step 0**. Use `- [~]` for genuinely partial work and say what remains.

**Correct anything the session made stale.** A blocker recorded earlier and
since resolved must be rewritten, not left standing — a future session reading
"BLOCKED ON HARDWARE" for a solved problem wastes a whole planning pass. This
happened for real: route 2 (calendar sharing) stayed listed as the plan after
it was known dead.

**Never delete.** Superseded items are struck through and dated, with the
reason. That is a project-wide rule, not a roadmap convention.

New ideas raised this session go in the appropriate sprint or `Future
Explorations` — with enough context that a cold reader knows *why* it was
wanted, not just what it was. Record the constraint alongside the idea when one
is known.

## Step 3 — CHANGELOG (write this BEFORE the handoff)

**The ordering is the point.** `CHANGELOG.md` is the source of truth for *what
happened*; the handoff is a derived view of *what to do next*. Both documents
used to want updating at session end, both covered overlapping ground, and
whichever came second got skipped — leaving two files that disagreed about the
state of the build. Write the changelog first, then derive.

Follow the file's own rules, which differ from Drywater's:

- **Keep a Changelog format**, grouped under `### Added` / `### Changed` /
  `### Fixed` / `### Known unknowns` — not a per-sprint block.
- **Everything stays under `[Unreleased]`.** `0.1.0` is unpublished.
- **Nothing is deleted.** Corrections are appended with a date; superseded text
  stays and is marked superseded.
- **Answered unknowns are struck through and marked ANSWERED with the date and
  the answer** — not removed. The question and its resolution are both signal.

Be specific, and record the *reasoning*, not just the change. The entries that
have earned their keep are the ones explaining why something was done a
particular way — "a uniform 7:1 floor cannot be met by a saturated blue,
because luminance weights blue at 0.0722" is worth ten lines saying the accent
changed.

**Record behaviour changes explicitly, including side effects.** Those are the
entries a future session needs and the ones most often lost.

**Log panel failures WITH DATES.** The hardware rates 3.7★ with a documented
pattern of flicker-then-death at 1–8 weeks. If the panel misbehaved at all, it
goes in the changelog with the date — that record is the evidence that would
justify the decoupled transport, and it only exists if it is written down as it
happens.

## Step 4 — Lessons Learned

If anything was discovered that a future session should know — Windows quirks,
Google API behaviour, device behaviour, decisions and their reasoning, things
that broke and why — append it to **Lessons Learned in `CLAUDE.md`**, dated.
Peripheral has no `docs/architecture/` tree; `CLAUDE.md` is the map.

Two standing rules to apply here:

- **One failure → one standing rule.** Do not stop at the fix. Name the rule
  that prevents the whole class, and put it where it will be read. "A dead
  daemon must LOOK dead" is worth more than the `process.exit(1)` that occasioned it.
- **Any behaviour the device exhibits that we cannot explain gets a committed
  diagnostic script, not a note.** The script survives a firmware revision and
  a replacement unit; a note does not. `npm run idle-test` is the precedent.

Then verify that `CLAUDE.md`'s factual sections still match reality — the
hardware table, Environment & Credentials, Tech Stack, and the Status block.
A stale line there misleads a cold start more than a missing one.

If nothing was learned, skip this step. Do not add filler.

## Step 5 — Memory sync

Update `C:\Users\grcad\.claude\projects\C--dev-peripheral\memory\`:

- Facts that are **durable and not derivable from the repo** — Ricky's
  preferences, constraints, external context.
- `MEMORY.md` — only if a memory file was added or removed. One line per
  memory, never content.

**Do not duplicate the repo.** Code structure, past fixes, git history and
anything already in `CLAUDE.md` do not belong in memory. If it can be answered
by reading the repo, it is not a memory.

## Step 6 — Commit and push

Stage everything. Commit with a message that explains the *why*, following the
project's established style — Conventional Commits header, then prose covering
the reasoning, the failure modes found, and what is explicitly unverified.

Recent commit bodies are the template. They are long on purpose: the commit
message is the only artifact that travels with the diff.

`chore(session-close): session notes and roadmap sync — YYYY-MM-DD` is the
right subject **only when the session produced no code.** Otherwise the commit
describes the work.

Then: **push to `dev`.** `main` only on Ricky's explicit instruction — never
assumed, and never as part of session close.

Before pushing, confirm `npm test` passes and say the number out loud. Note
that the test script uses a scoped glob deliberately: bare `node --test`
discovers `src/transport/idle-test.js` and drives real hardware for 68 seconds.

## Step 7 — Handoff (derived from Step 3)

**Write a NEW dated file** at `docs/plans/session-handoff-YYYY-MM-DD[letter].md`
— `b`, `c`, `d`… for multiple sessions in one day. **Never edit a previous
handoff.** Each new one opens by naming the file it supersedes and stating that
the old one is kept for the record.

Derive it from the changelog. If the two disagree, the changelog wins — say so
in the file, as the existing handoffs do.

Contents:

- **Where the project lives** — paths, remote, token store, state cache, log.
- **What works right now**, with the command table.
- **The next action**, and whether it needs Ricky.
- **Then, in order** — the ordered queue.
- **Facts established the hard way — do not re-derive.** The most valuable
  section. Carry forward the previous handoff's entries and add this session's.
- **Open questions for Ricky.**

Write for a **cold start after a multi-day gap**, because that is the real
reading condition. Assume no memory of this session at all.

Then update the pointer in `CLAUDE.md`'s Status block to the new file.

## Step 8 — Leave the panel lit

Drywater's last step is release execution. Peripheral's equivalent is smaller
and easier to forget: **this thing is supposed to be running on Ricky's desk
right now.** A session that ends with a stopped daemon has shipped a dark
panel, and the failure is silent — he will not find out until he glances up.

```bash
npm run startup:status
```

Confirm the task is registered **and the process is actually up** — a task can
sit at `Ready` with result 0 while nothing runs. If the session restarted the
daemon for testing, restart it one final time from the logon task so the
running process matches the committed code. Check the log is clean:

```bash
npm run startup:logs
```

Report the last heartbeat and say plainly whether the panel is live. If the
daemon is intentionally left down, say that too, and why.

**Then say what has not been seen by eye.** Close the session on the same
honesty the gate opened it with: the panel is running the new code, and whether
that code *looks* right is still Ricky's call to make.
