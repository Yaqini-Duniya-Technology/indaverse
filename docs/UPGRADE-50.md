# Release hardening: 50 scoped improvements

This batch improves the existing MVP. It does not add AI asset generation,
a complete game engine, multiplayer or publishing. No database migration is needed.

## Configuration and authentication

1. Default API configuration uses development port 8002.
2. CORS origins are configurable as a JSON array.
3. CORS configuration rejects wildcards, credentials and URL paths.
4. Trusted hosts are configurable and checked on incoming requests.
5. Production refuses short or placeholder signing secrets.
6. Production refuses insecure cookie configuration.
7. Production requires HTTPS application/API URLs and origins.
8. Authentication cookie issuance uses configured Secure settings.
9. Token lifetime is configurable with a bounded interval.
10. Logout clears cookies using matching security attributes.
11. JWT decoding requires expiry and subject claims.
12. Unsupported password hashes fail authentication without crashing.
13. Registration trims usernames before length validation.
14. Authentication input rejects unexpected fields.
15. Login passwords have bounded input length.
16. Registration uniqueness races roll back and return a conflict.

## Input and HTTP boundaries

17. Project creation trims names and rejects blank results.
18. Project creation bounds descriptions to 5,000 characters.
19. Blank project descriptions normalize to null.
20. Project creation rejects unexpected fields.
21. Creative brief versions reject booleans and coerced strings.
22. Plan creation versions require strict integers.
23. Plan update versions require strict integers.
24. Plan review versions require strict integers.
25. API responses carry nosniff headers.
26. API responses deny framing.
27. API responses suppress referrer disclosure.
28. API responses disable HTTP caching.
29. Responses carry independently generated request IDs.
30. Browser writes from disallowed origins are rejected.

## Readiness, media and project listing

31. A readiness endpoint checks the database separately from liveness.
32. Readiness checks Redis with bounded socket timeouts.
33. Readiness failures return 503 without connection details.
34. Uploaded media is no longer mounted as a public static directory.
35. Audio content requires authentication and project ownership.
36. Audio paths resolve beneath a canonical storage root with containment checks.
37. Audio responses return API paths instead of server filesystem paths.
38. Empty audio uploads are rejected.
39. Failed audio writes and database saves clean up partial files.
40. The music player uses protected audio URLs with credentialed playback.
41. An additive paginated project endpoint bounds page sizes.
42. Paginated projects support type and literal name-search filters.
43. Project lists use deterministic ordering for equal timestamps.

## Reproducibility and operations

44. A portable test runner forces isolated test settings and unique temp paths.
45. Local setup installs dependencies and creates missing secrets without replacing existing configuration.
46. A PowerShell release verifier runs API tests, web build and whitespace checks.
47. Local backup tooling copies a PostgreSQL archive and media, inspects the archive and records checksums.
48. A tracked-path guard detects known private/generated paths without printing contents.
49. GitHub Actions runs API and web verification with read-only repository permissions.
50. Operational documentation and tracked environment examples describe setup, deployment boundaries and restore verification.

## Verification boundaries

Automated regression tests cover configuration, input validation, cookies,
JWT claims, origin checks, headers, audio ownership and cleanup, pagination,
readiness and registration conflicts. Existing studio regression tests run too.
The web production build verifies TypeScript compatibility.

Windows PowerShell scripts, Docker backups, cross-origin audio playback,
production cookies and PostgreSQL concurrency must also be checked on the
actual target environment. CI is prepared but has not run until pushed.
