# Session handoff — 2026-08-17 (fourth session)

Supersedes `session-handoff-2026-08-17c.md`, written a few hours earlier while
the OAuth client still did not exist. That file is kept for the record; **this
one is current.**

Derived from `CHANGELOG.md`, per the session-end ritual. If the two disagree,
the changelog wins.

## Sprint 1 is done

**The panel is showing Ricky's real day.** Work and personal calendars, merged
by Google server-side through one in-org OAuth token, rendered at 1280×480 and
pushed over HID at 1 fps, started automatically at logon.

The North Star — *stop opening Google Calendar to find out whether there's a
meeting soon* — is functionally met. What remains is polish and endurance.

## The thing that unblocked it

**Route 1a: the OAuth client must live in a Cloud project inside
`balcomagency.com`.**

A client owned by a *personal* Cloud project is a **third-party app** to
Balcom's Workspace and is blocked outright — `admin_policy_enforced`, the
"This app is blocked" screen, no click-through. A client owned by an *in-org*
project is an **internal app** and is trusted by default. Same scopes, same
account, same code; only project ownership differed.

Internal user type also removes the 7-day refresh-token expiry, the
verification requirement, and the test-user list. **ICS (route 3) is dead and
does not need building.**

## What the live account actually returned

8 calendars visible. **Three are on the panel:**

| Label | Calendar | Why |
|---|---|---|
| `work` | `ricky.cadden@balcomagency.com` | primary |
| `personal` | `grcadden@gmail.com` | **`accessRole: owner` — full titles, not free/busy** |
| `travel` | TripIt import feed | flights and hotels; imported, so it lags 8–24h |

**Five are deliberately excluded** — Nick's, Alex's, Brittany's and Steve's
calendars plus the "B Gone" team calendar. Those are colleagues' calendars,
visible for scheduling. Putting a direct report's 1:1s on this panel would bury
Ricky's own next meeting under other people's days. Reasoning is in `.env` next
to the setting.

The personal calendar arriving as `owner` is the load-bearing confirmation:
the whole work-as-primary design depended on the shared-in calendar carrying
full event details, and it does.

## What works right now

```bash
npm run startup:status
```

| Command | What it does |
|---|---|
| `npm start` | Full daemon — server, renderer, transport |
| `npm test` | 38 tests. Zero dependencies |
| `npm run auth -- --status` | What is in the token store, no secrets |
| `npm run startup:status` | Task state **and** whether the process is actually up |
| `npm run startup:logs` | Tail the daemon log |
| `npm run serve` | Server only; open the pane in a browser |
| `npm run send -- docs/first-light.jpg` | Push one JPEG. Transport smoke test |
| `npm run idle-test` | Re-measure the panel's ~3s idle timeout |
| `npm run palette` | Regenerate `web/tokens.css` from the wallpaper |
| `npm run probe` | Enumerate the HID device |

Measured this session: **29–30 pushes per 30s heartbeat, 0 failures, 0 calendar
errors**, running under the logon task.

## Next actions

1. **Live with it for a day.** Everything below is speculation until it has
   survived a normal workday. Specifically watch for whether the countdown is
   the number you actually glance at, or whether the list is.
2. **Confirm the token refreshes.** The refresh path has never run — the access
   token was under an hour old when the session ended. Internal apps have no
   7-day expiry, but that is documentation, not observation. If the panel is
   still live tomorrow morning, that is the proof.
3. **Chase the push-rate degradation under host load** (see open questions).
   This is the one known thing that could make the panel visibly flicker.
4. **Decide about `outOfOffice` and `focusTime`.** They are kept on purpose —
   blocked time is real time — but they *can* take the hero slot. Live with it
   a day and see whether "Focus time" in the countdown is useful or annoying.
5. Sprint 3 packaging — still deferred deliberately, and the repo still goes
   public before it.

## Facts established the hard way — do not re-derive

Everything in the previous handoffs still holds. Added this session:

- **A personal-project OAuth client cannot consent against Balcom.** In-org is
  the only route. Do not retry the personal project.
- **`cmd` treats `&` as a command separator**, so `cmd /c start "" <url>`
  delivers only the query string up to the first parameter. This truncated
  every OAuth URL and produced `invalid_request: Required parameter is missing:
  response_type`, which read as a Google-side account problem for most of a
  session. The URL printed to the terminal was correct the whole time — only
  the auto-open path was broken. **A launcher bug can masquerade as a policy
  problem; check what the browser actually received before believing a remote
  system.** Now uses `rundll32 url.dll,FileProtocolHandler`, which invokes no
  shell at all.
- **Real calendars carry three things mock data does not:** concurrent events
  (so "which live event is the hero" is a real decision — it is the one ending
  soonest), Google's metadata event types (`workingLocation` cost a row every
  weekday), and autocompleted postal addresses long enough to reflow the
  layout. **Mock data is well-formed by construction and will never warn you
  about any of this.**

## Open questions for Ricky

1. **Does it survive a night and a refresh cycle?** Unanswered until tomorrow.
2. **Does the panel flicker when the PC is busy?** Undisturbed it holds 29–30
   pushes per 30s. Under this session's own concurrent test processes the same
   heartbeats read 19, 25 and 15, with `frameAge` touching 3s — inside the
   panel's forget window. Suspect the render and push timers competing on one
   event loop, which is the exact coupling the two-loop design was meant to
   remove. Not diagnosed.
3. **Is the travel feed worth its row?** It is an imported feed, so it refreshes
   on Google's schedule rather than in real time. Fine for a flight tomorrow,
   not something to trust to the minute.
4. **Should the personal Google Cloud project be deleted?** It is unused now.
   The in-org project is the live one, and the personal client id/secret were
   exposed in a chat transcript — low consequence for a desktop client with
   PKCE, but there is no reason to keep either around.
5. **Leave the logon task installed?** It is registered and running.
   `npm run startup:uninstall` removes it cleanly.
