# Credits and entitlements

Migrate the database to revision `d45be13ac018` (after the invite-only
revision). Existing accounts remain on Free until an operator assigns a plan.
No existing project or file is deleted. The wallet appears under **Dashboard →
Credits and plans**. Keep `CREDIT_ENFORCEMENT=false` during initial migration and
backup rehearsal. Enable it only on the intended beta environment.

## Plan policy

Five configurable tiers ship with initial beta quotas: Free, Creator Basic,
Creator Pro, Creator Studio and Enterprise. The sample quotas are editable;
prices and action costs are unset. The API reads a validated JSON
`CREDIT_POLICY` setting. To make a template from the defaults, from `apps/api` run:

```text
python -c "from app.core.credit_policy import default_credit_policy; print(default_credit_policy().model_dump_json())"
```

Set all five plan keys in the JSON. Prices are integer NGN kobo (`100` is ₦1).
Use `null` for an unset price or unlimited quota, and omit costs for actions
that should not accept reservations. Supported fields include the price for
each billing period, included credits per paid period, allowed project types
and AI actions, project and download limits, stored media bytes, export edge,
and premium exports. Restart the API after changing policy. Entitlements
follow the policy currently on the server. Credits already granted and
reservation prices already confirmed do not change retroactively.

From the API folder on the trusted host, in its configured virtual environment:

```text
python -m app.credit_admin plan creator@example.com beta-plan-001 basic monthly 2027-01-01T00:00:00Z
python -m app.credit_admin grant creator@example.com beta-promo-001 promotion 10
python -m app.credit_admin reverse creator@example.com beta-reversal-001 beta-promo-001 2
```

Use a unique, opaque reference for each intended operation and reuse it on
retry. Plan assignments are prepaid/manual, and automatically fall back to Free
when the stored period ends. Renewal and checkout are separate work. Reversals
only remove credits still available in the original grant; held or spent
credits require manual reconciliation. Do not reuse references for unrelated
payments or jobs.

## API and charging contract

- Authenticated reads: `GET /api/v1/credits`, `/credits/plans`,
  `/credits/quote/{action}`, and `/credits/history`. Responses are scoped to the
  authenticated user. There is no public credit mutation endpoint.
- A future payment handler calls `grant_credits` only after it verifies the
  provider result. A future job handler calls `reserve_credits` with a stable
  job reference and the user-confirmed cost, then commits with the job record.
  If the configured cost changed, the server rejects the stale confirmation.
  Replaying a reservation returns its existing state; it does not authorize
  a second provider run. The job system must claim work separately.
- Workers call `finish_reservation` in the transaction that stores the outcome.
  Charge zero for a failed/cancelled job; for an accepted partial result, charge
  only that result up to the reservation cap. Unused credits are returned to
  their original lots unless expired. Consume the earliest expiring lot first.
  A hold does not time out on its own; the worker must reconcile abandoned work
  against job and provider state before releasing it.
- Ledger entries record grants, holds, settlements, releases, reversals, plan
  changes and expiry. Wallet reads exclude expired credits immediately; expiry
  is written to the ledger on the next credit mutation.

## What the quotas cover

An explicit successful server export or image attachment consumes one slot in
the UTC calendar month. A repeat export counts again. Failed validation,
ownership checks and failed renders do not count. The server records quota
before handing off the response; it cannot know whether the browser saved it.
The Video Studio delivery ZIP is a premium export. Video and original image
attachments are checked against the plan resolution limit; clip export uses
the route's existing 1920 px maximum as a conservative bound.

The project cap includes archived projects and covers creation, duplication
and the Zamara demo. Plan studio restrictions apply to new projects; previous
projects remain accessible. Media storage caps cover stored images, audio,
video sources and soundtracks, including image copies and derivatives. They
do not measure temporary render files, drafts or database overhead.

Playback, private previews, browser-only exports and copying rendered content
are outside the download quota. This is an allowance for server-issued
attachments, not copy protection. Community and public asset downloads are not
implemented in this batch. No payment or AI provider is activated by this code.
