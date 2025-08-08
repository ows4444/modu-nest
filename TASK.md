# Code Architect Review Prompt

As a code architect, your goal is to **deeply review** the provided documentation (`@CLAUDE.md`, `@docs`) and the current codebase.  
Focus only on:
- **Plugins**
- **Apps**
- **Tools**
- **Libs**
- **Docs**
- **CLAUDE.md**

Ignore frontend, Docker, and testing-related concerns.

Your task is to create a **comprehensive `TODO.md` checklist** of actionable items, with detailed references to files, priorities, and rationale.  
Each item should identify:
- **Refactoring needs**
- **Business architecture gaps**
- **Incomplete implementations or flows**
- **Overcoding (unnecessary complexity)**

Where possible, include **recommended fixes** or patterns to apply.

---

## Areas to Assess & Checklist Creation

### 1. **Plugins**
- Review internal **modularity, code quality, maintainability**.
- Check **integration with host app** (event bus, guards, manifests, version compatibility).
- Identify **tight coupling** or **unnecessary dependencies**.
- Spot **incomplete plugin APIs** or missing manifest fields.
- Highlight **performance bottlenecks** in plugin initialization or runtime.

### 2. **Apps**
- Evaluate **cross-module architecture** and **separation of concerns**.
- Identify **performance bottlenecks** (slow DB queries, unoptimized service calls, heavy in-memory processing).
- Verify **business logic correctness** against documented workflows.
- Check for **missing features** or incomplete flows.
- Detect **over-engineering** or redundant implementations.

### 3. **Tools**
- Review **developer usability** (CLI UX, arguments, defaults, feedback).
- Check **maintainability** and modular design.
- Identify **performance inefficiencies**.
- Spot **automation opportunities** (replace manual tasks with CLI commands or scripts).

### 4. **Libs**
- Assess **code quality** and **generic reusability** across projects.
- Verify **API stability** and **semantic versioning** practices.
- Check **dependency health** (no unused or outdated packages).
- Identify **duplicated logic** that should be centralized in libs.
- Ensure libs are **lightweight and efficient**.

### 5. **Docs** (`@docs`)
- Check **accuracy** against current implementation.
- Evaluate **developer onboarding effectiveness**.
- Review **consistency** in structure, tone, and formatting.
- Identify **missing sections** (e.g., flow diagrams, plugin loading sequence).

### 6. **CLAUDE.md**
- Verify **alignment with actual code and docs** (no contradictions).
- Ensure **guidelines are actionable** (clear, unambiguous).
- Suggest **enforcement mechanisms** (lint rules, pre-commit hooks).
- Recommend updates for **maintainability and clarity**.

---

## Deliverable

Produce a `TODO.md` file with:

- **Categories:** Plugins, Apps, Tools, Libs, Docs, CLAUDE.md
- **Each item contains:**
  - [ ] **Description** of the task.
  - **File/Module Path** (where applicable).
  - **Rationale** (why this matters).
  - **Priority** (High / Medium / Low).
  - **Suggested Fix** (brief, concrete approach).

---

## Example Output Structure

```markdown
# TODO Checklist

## Plugins
- [ ] Refactor `src/plugins/auth/plugin.ts` to reduce coupling with `UserService`.
  - **Rationale:** Current implementation tightly binds authentication to user entity, making it non-reusable.
  - **Priority:** High
  - **Suggested Fix:** Introduce an authentication interface and inject via plugin manifest.

## Apps
- [ ] Optimize database queries in `src/apps/core/services/InvoiceService.ts`.
  - **Rationale:** Current implementation performs N+1 queries; slows down invoice listing.
  - **Priority:** High
  - **Suggested Fix:** Use batch queries or joins with proper indexing.

## Tools
- [ ] Improve CLI argument parsing in `tools/migrate.ts`.
  - **Rationale:** Current parsing is manual and prone to errors; lacks help output.
  - **Priority:** Medium
  - **Suggested Fix:** Use a library like `commander` or `yargs` for parsing.

## Libs
- [ ] Consolidate duplicate date utility functions in `libs/utils/date.ts` and `libs/helpers/time.ts`.
  - **Rationale:** Duplicate logic increases maintenance cost.
  - **Priority:** Low
  - **Suggested Fix:** Create a shared `libs/datetime` module.

## Docs
- [ ] Update `@docs/plugin-system.md` with latest manifest schema.
  - **Rationale:** Current doc refers to outdated plugin loader API.
  - **Priority:** Medium
  - **Suggested Fix:** Sync docs with code from `src/core/plugin-loader.ts`.

## CLAUDE.md
- [ ] Clarify guidelines on plugin dependency injection strategy.
  - **Rationale:** Current wording is vague; devs are unsure whether to use constructor or manifest injection.
  - **Priority:** Low
  - **Suggested Fix:** Provide explicit code examples in CLAUDE.md.
