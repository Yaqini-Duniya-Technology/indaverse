# Commercial beta tracker

The baseline is the Creator Studios release. A batch is complete when it is
implemented, tested against its intended infrastructure and ready for the next
release gate. A passing local fixture does not imply live service verification.

| Batch | Status | Remaining acceptance |
| --- | --- | --- |
| 1. Private beta | Invite enforcement, admin CLI and registration form implemented | Hosted HTTPS, production database and media, audit and alerting, restore rehearsal and tester onboarding |
| 2. Credits and entitlements | Ledger, reservations, plans, wallet, operator grants and server quotas implemented | Hosted beta verification, provider-backed job/payment reconciliation, team seats and community download permissions |
| 3. Sandbox payments | Paystack test checkout, authenticated webhook, independent verification, history and prepaid plans implemented | Genuine provider test transaction and webhook delivery; automatic renewal, plan switching, refunds and disputes |
| 4. AI | Open | Provider integration, private outputs, limits, worker retries, credit settlement and real sandbox verification |
| 5. Publishing | Open | Studio publishing, visibility and download controls, ownership, unpublish and moderation |
| 6. Community | Open | Profiles, discovery, following, reactions, reports, messaging, block/mute and moderator workflows |
| 7. Accounts and help | Open | Verification and reset mail, onboarding, help by studio, account settings and support |
| 8. Advanced studios | Open | Game mechanics and packaging, music editing, video finishing, image composition, story planning and web app workflows |
| 9. Release integration | Open | Real backup rehearsal, cross-studio workflows, production smoke tests, review and release decision |

The draft branch does not authorize paid hosting, provider spending, live
payments, or public signups. Keep those disabled until explicitly approved.

See [credits and entitlements](CREDITS-AND-ENTITLEMENTS.md) for configuration and verification.

See [Paystack sandbox payments](PAYSTACK-SANDBOX.md) for the test-mode runbook.
