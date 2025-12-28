# Upstream Sync Guide

## One-time setup

```powershell
# ensure remotes are set up
git remote add origin git@github.com:kizzz/happy-server.git  # should already exist
git remote add upstream https://github.com/slopus/happy-server.git  # fetch-only recommended
```

Then fetch all refs:

```powershell
git fetch --all --prune --tags
```

## Syncing your fork's default branch (rebase workflow recommended)

Rebase keeps the fork clean by replaying your commits on top of upstream:

```powershell
# update the local upstream tracking branch
git checkout upstream/main
git pull --ff-only

# switch to your fork default branch and rebase
git checkout main
git fetch upstream
git rebase upstream/main
```

If you prefer merge instead, replace the last command with `git merge upstream/main`, but rebase avoids merge commits.

## Keeping feature branches current

```powershell
# from your feature branch
git fetch upstream
git rebase upstream/main
```

If the feature branch tracks `origin`:

```powershell
git push origin HEAD --force-with-lease
```

## Resolving conflicts

1. Resolve files marked by Git.
2. Use `git rebase --continue` (after resolving and `git add`).
3. If the rebase becomes too complex, `git rebase --abort` then consider merging instead.
4. Always rerun `git status` to confirm a clean tree before pushing.

## Pushing updates to your fork

```powershell
git checkout main
git push origin main
```

For rebased feature branches, use `--force-with-lease` to keep the fork clean while being safe:

```powershell
git push origin feature/something --force-with-lease
```
```
