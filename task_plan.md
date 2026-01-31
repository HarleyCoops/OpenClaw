# Task Plan: Get OpenClaw Building and Running

## Goal
Successfully build and run OpenClaw locally, resolving all installation issues on WSL (preferred) or Windows.

## Phases
- [x] Phase 1: Diagnose current state - check what's installed, what errors exist
- [x] Phase 2: Verify prerequisites - Node.js version, pnpm, git submodules
- [x] Phase 3: Fix WSL installation - complete the copy and build process
- [x] Phase 4: Run the build commands and fix any errors
- [x] Phase 5: Verify the build works - run dev server or tests
- [x] Phase 6: Document working setup for future reference

## Prerequisites Checklist
- [x] Node.js >= 22.12.0 (v22.22.0 installed via nvm)
- [x] pnpm installed (v10.23.0 via corepack)
- [x] Git submodules initialized (vendor/a2ui)
- [x] Running from WSL native filesystem (~/openclaw)

## Working Commands (run in WSL)

```bash
# Always source nvm first (or add to .bashrc)
source ~/.nvm/nvm.sh

# Navigate to project
cd ~/openclaw

# Install dependencies
pnpm install

# Build UI
pnpm ui:build

# Build main project
pnpm build

# Verify it works
node openclaw.mjs --version  # outputs: 2026.1.29
```

## Root Cause Analysis
The Windows build failed because:
1. `pnpm build` calls `bash scripts/bundle-a2ui.sh`
2. This bash script runs in WSL context even from Windows PowerShell
3. WSL translates paths to `/mnt/c/...` format
4. TypeScript couldn't resolve the cross-filesystem paths

**Solution**: Run everything natively in WSL's ext4 filesystem (`~/openclaw`), not `/mnt/c/...`

## Errors Encountered & Resolutions
- [Windows build]: `error TS5058: The specified path does not exist` → Resolved by running in WSL native fs
- [GitHub auth in WSL]: Couldn't authenticate → Resolved by copying existing clone from Windows
- [pnpm EPERM error]: pnpm tried to use Windows temp dir → Resolved by using `bash -lc` with nvm sourced

## Status
**COMPLETE** - OpenClaw builds and runs successfully in WSL
