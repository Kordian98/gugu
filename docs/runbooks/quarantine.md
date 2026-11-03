# Quarantined tests

Tests that proved non-deterministic are tagged `@quarantine`, excluded from `pnpm verify` /
`pnpm gate` / the E2E merge-gate run, and run only in `pnpm gate:nightly`. One line each:
test id, date, symptom, suspected cause, owner. Remove the line when the root cause is fixed.

| Test | Since | Symptom | Suspected cause | Owner |
|---|---|---|---|---|
| — | — | none quarantined | — | — |

Known product bugs are not quarantined: they are written as `test.fail()` with an `issue`
annotation (see `e2e/web/README.md`), so the suite stays green and flips when the bug is fixed.
