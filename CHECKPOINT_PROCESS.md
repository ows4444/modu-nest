# Architectural Checkpoint Process

This guide outlines the recommended process to follow before and after implementing each item from the architectural TODO checklist. Consistent use of these steps helps prevent regressions, ensures code quality, and maintains architectural integrity.

---

## ⏳ **Before Implementation ("Pre-Impl Check")**

1. **Analyze Related Libraries and Dependencies**
   - Review all affected libraries for API contracts and integration points.
   - Identify any shared types, interfaces, or utility functions that may be impacted.
   - Check for circular dependencies or legacy code that might conflict with new changes.

2. **Type and Interface Verification**
   - Ensure all types and interfaces are well-defined and up-to-date.
   - Prefer using explicit types and interfaces rather than `any` or loose typing.
   - Refactor or consolidate interfaces for clarity and maintainability if required.

3. **Test Coverage Review**
   - Locate existing unit, integration, and end-to-end tests relevant to the change.
   - Identify missing test cases and plan for additional coverage as necessary.

4. **Design Documentation**
   - Update or create design docs to explain the planned change, especially for architectural or critical code.
   - Document expected impacts on other system components.

---

## ✅ **After Implementation ("Post-Impl Check")**

1. **Project-wide Verification**
   - Run all project tests (unit, integration, end-to-end) to verify no existing functionality is broken.
   - Check for regressions in related plugins, apps, and libraries.

2. **Lint, Build, and Format**
   - Run the linter (`npm run lint`, `eslint`, etc.) to catch style and code quality issues.
   - Format code with Prettier or project-standard formatter.
   - Build the project to ensure there are no type or compile errors.

3. **Manual Smoke Testing**
   - Manually test critical flows impacted by the change.
   - Validate edge cases and error scenarios.

4. **Documentation Update**
   - Update README, CLAUDE.md, or other relevant docs to reflect the change.
   - Add migration guides or notes for breaking changes if applicable.

---

## Example Checklist for Each TODO Item

| Step            | Description                                                 | Status |
| --------------- | ----------------------------------------------------------- | ------ |
| Pre-Impl Check  | Review related libs, verify types/interfaces, plan tests    | ☐      |
| Implementation  | Make the change as described in the TODO                    | ☐      |
| Post-Impl Check | Verify project, lint/build/format, manual test, update docs | ☐      |

---
