# Development checks

- Before editing, identify the behavior to preserve and the failure case the change addresses. Follow the existing workspace boundaries and patterns.
- Add tests for meaningful behavior changes: user-visible results, ownership, persisted state, or recovery from failure. Mock external services, not the logic being tested. See `TESTING.md` for fixtures and examples.
- Handle rejected promises. `void` is appropriate only when the operation handles its own errors or its API handles them; it does not catch a rejection.
- Keep hooks' dependencies accurate. Prefer functional state updates or primitive dependencies when an object would cause unnecessary reruns.
- Before completing a change, run `npm run verify` from the repository root. Run `npm run verify:build` for changes affecting the web build, dependencies, or configuration. These commands are local and do not deploy.
- Use `npm run format` to format and `npm run lint:fix` for safe automatic fixes. Review the diff after either command. Do not disable checks just to make them pass; explain any necessary scoped exception.
- Review the diff for unrelated changes and run `git diff --check`. Report the checks actually run, their result, and any remaining limitation. Do not claim browser/device or live-provider validation from unit tests.
