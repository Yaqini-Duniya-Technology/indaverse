# IndaVerse sandbox payments

This draft implements Paystack **test mode only**. Flutterwave also offers a
sandbox and transaction verification; Paystack was selected for this slice
because its hosted checkout, lookup by merchant reference and signed webhook
fit the existing credit ledger without an extra checkout SDK. The current
Paystack documentation is linked below. No merchant account was connected or
charged while implementing this branch.

## Run on an approved private test environment

1. Back up and rehearse the migration. Run Alembic through
   `2eb745c18a60`, after credits revision `d45be13ac018`. Do not roll back
   a database with payment history without preserving the journal.
2. In Paystack's **Test Mode**, obtain the test API secret and a webhook
   signing secret. Put them in the **API server's** secret store as
   `PAYSTACK_TEST_SECRET` and `PAYSTACK_WEBHOOK_SECRET`. Never put them in
   the browser, a Git commit, or a message. Live API keys are rejected.
3. Configure `APP_URL` as the private frontend origin and configure allowed
   API hosts and CORS origins. Use `PRIVATE_BETA=true` for the hosted
   environment. Enable `PAYSTACK_SANDBOX_ENABLED=true` only there.
4. Configure test prices in integer kobo. For example, this is a fixture,
   not an approved selling price:
   `CREDIT_BUNDLES={"starter":{"name":"Starter Credits","credits":10,"amount_kobo":250000}}`.
   Omit unapproved bundle offers. To test a plan, configure its monthly or
   annual kobo price and included credits in `CREDIT_POLICY`.
5. To receive webhook delivery, add the HTTPS API endpoint
   `/api/v1/payments/paystack/webhook` to the Paystack test dashboard.
   The webhook must be reachable by Paystack; the rest of the application
   can remain invitation-only. Use the signing secret and leave the legacy
   fallback off unless required by the account's existing test integration.
   Manual verification can be exercised without a reachable webhook.
6. In **Dashboard → Credits and plans → Test checkout**, choose an offer and
   confirm the amount. Use only a Paystack test payment method. After return,
   click **Verify returned test payment**. Confirm history, the wallet delta
   and the corresponding credit transaction.
7. Resend the signed webhook from the test dashboard. Recheck the wallet and
   confirm there is still exactly one credit grant. Try a failed test payment
   and confirm it does not grant credits. Test as a second beta account and
   confirm the first user's payment is invisible and cannot be verified there.

## What fulfillment guarantees

- The API freezes product, exact amount, email, included credits and billing
  period at confirmation. A retry uses the same server-created reference. A
  browser redirect is only a pointer; it never grants value on its own.
- The webhook authenticates the original bytes and re-verifies the
  transaction with Paystack. A successful result must match the saved reference,
  test domain, exact kobo amount, NGN currency and payer email. A unique
  provider transaction ID cannot fulfill multiple orders. The payment and
  wallet updates commit together. Only the current payment state and a
  non-sensitive audit trail are stored; raw events and card details are not.
- Pending, failed and abandoned payments grant no value. Owners can verify an
  existing test payment again; provider checks on the same reference are
  limited to one every ten seconds. If Paystack accepted initialization but
  its checkout URL was never saved, check the existing reference before
  starting another payment. Provider-side uncertainty is not proof of failure.
- A verified monthly or annual purchase adds one prepaid period, with
  calendar-month handling. The same tier can be extended; the creator returns
  to Free at expiry. Switching between active paid tiers is blocked. If a
  different plan became active after checkout opened, a verified payment is
  recorded as **Needs review** and grants nothing until handled by an operator.
- Use `python -m app.payment_admin inspect <reference>` or
  `python -m app.payment_admin reconcile <reference>` from `apps/api` on the
  trusted host. Review cases are terminal for automated fulfillment. Handle
  refunds or disputes in the provider dashboard, then reconcile the wallet
  through a reviewed operator process. The existing credit reversal command
  can remove unspent credits from a verified bundle grant. Consumed/reserved
  credits need manual reconciliation.

Automatic renewals, prorated plan changes, and automated provider refund or
chargeback handling are outside this draft. Keep real payments disabled. Local
tests use provider fixtures; a genuine Paystack test payment still requires
authorized test credentials.

- [Paystack transaction API](https://paystack.com/docs/api/transaction/)
- [Paystack webhooks](https://paystack.com/docs/payments/webhooks/)
- [Paystack test and live authentication](https://paystack.com/docs/api/authentication/)
- [Flutterwave verification](https://developer.flutterwave.com/docs/transaction-verification)
