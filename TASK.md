# Code Architect Review Prompt

As a code architect, your goal is to thoroughly review the provided documentation (`@CLAUDE.md`, `@docs`) and the current codebase. Based on your review, create a comprehensive `TODO.md` checklist of actionable tasks to refactor and improve the application.

## Areas to Assess & Checklist Creation

1. **Code Architecture**

   - Identify architectural patterns (MVC, layered, microservices, etc.).
   - Spot monolithic or tightly coupled areas that would benefit from modularization.
   - Propose improvements to separation of concerns, abstraction, and encapsulation.
   - Suggest enhancements for code reusability and extensibility.

2. **Performance**

   - Locate performance bottlenecks (slow database queries, inefficient loops, redundant computations).
   - Recommend optimizations for critical code paths.
   - Suggest caching strategies, lazy loading, or concurrency improvements.
   - List places where profiling and benchmarking are needed.

3. **Scalability**

   - Identify limitations to scaling (single-threaded code, hardcoded resources, etc.).
   - Recommend strategies for horizontal/vertical scaling.
   - Suggest migration paths to cloud-native or distributed architectures if necessary.

4. **Maintainability & Readability**

   - Highlight areas with complex or unreadable code.
   - Suggest refactoring for clarity, comment improvements, and better naming conventions.
   - Propose adding or improving documentation for unclear modules/functions.

5. **Security**

   - Identify potential security vulnerabilities (input validation, authentication, authorization).
   - Recommend best practices for secure coding.
   - Suggest improvements to secrets management and dependency updates.

6. **Testing**

   - Point out missing unit, integration, or end-to-end tests.
   - Recommend improvements to test coverage, reliability, and automation.
   - Propose CI/CD pipeline enhancements for faster feedback.

7. **DevOps & Deployment**

   - Assess build and deployment scripts for inefficiencies.
   - Suggest containerization, orchestration, or infrastructure-as-code improvements.
   - Recommend monitoring, logging, and alerting enhancements.

8. **Other Areas**
   - Accessibility, internationalization, and localization.
   - Compliance with relevant standards (e.g., GDPR, ADA).
   - Dependency management and third-party library updates.

## Deliverable

- Create a `TODO.md` file listing all actionable items, grouped by category (architecture, performance, etc.).
- Each item should be concise, specific, and ideally include a rationale.
- Prioritize tasks where possible (e.g., High/Medium/Low).

---

**Example Output Structure for TODO.md:**

```markdown
# TODO Checklist

## Architecture

- [ ] Refactor monolithic modules into separate services (High)
- [ ] Introduce repository pattern for data access (Medium)

## Performance

- [ ] Optimize the user authentication flow for speed (High)
- [ ] Profile and refactor slow database queries in `UserService` (High)

## Maintainability

- [ ] Rename cryptic variables in `main.js` (Low)
- [ ] Add missing docstrings to core modules (Medium)

...
```
