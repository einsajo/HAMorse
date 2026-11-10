# Running this spec with Kiro Crew

Kiro Crew runs on your own computer, not in Kiro Web.
Docs: <https://kiro.dev/docs/crew/installation.md> and
<https://kiro.dev/docs/crew/features/task-runner.md>.

## 1. Install (once)

- **macOS / Linux:** `curl -fsSL https://download.crew.kiro.dev/cli.sh | sh`
- **Windows:** use the Kiro Crew desktop app from the install page.
- Crew uses the **Kiro CLI** as its agent backend, so install the Kiro CLI and
  sign in first. Crew needs Python 3.12+.

Then:

```bash
kirocrew setup     # first-time configuration
kirocrew doctor    # checks everything is wired up
```

## 2. Run the task

```bash
git clone https://github.com/einsajo/HAMorse.git
cd HAMorse
npm ci
kirocrew run .kiro/specs/hamorse-progress/TASK.md
```

You can also open the dashboard (`kirocrew gateway`, then
<http://localhost:5476>), go to **Projects → From Spec**, upload `TASK.md`
and click **Run**. You'll see the plan, each step and the reviewer's checks
live.

What happens:
1. Crew breaks the spec into steps. Independent steps run in parallel,
   3 at a time.
2. Each step runs in its own session, the tests run, and a separate reviewer
   session reads the real `git diff`. A step that fails review is reverted
   and retried.
3. Work lands on its own branch, `kirocrew/task/<id>`, one commit per step,
   in a git worktree, so your checkout is untouched. Progress is written to
   `.kiro/specs/hamorse-progress/TASK_PROGRESS.md`.

## 3. Hand it back

```bash
git push origin kirocrew/task/<id>
```

Open a pull request from that branch into `main`, or tell Kiro the branch
name, and it will review the diff, test it on a phone-sized screen, and open
the PR. Keep `TASK_PROGRESS.md` in the PR: it's the visible record of the
Crew run.
