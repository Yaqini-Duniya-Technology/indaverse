# Private beta access

This slice adds invite-only registration and account grants. It leaves existing
development installs open by default. It does not create a hosted environment.

From the API directory, using the virtual environment configured for the intended
beta database:

1. Back up the database and media and rehearse the migration on an isolated copy.
2. Run `python -m alembic upgrade 86db3e0928a1`.
3. Grant access to any existing users who should retain it:
   `python -m app.beta_admin grant creator@example.com`.
4. Set `PRIVATE_BETA=true` and restart the API. Check that sign-in and project
   requests work for a granted account and fail for an ungranted account.
5. Run `python -m app.beta_admin invite tester@example.com --hours 72`. Share the
   displayed code privately with that person. The registration form expects the
   same email. Do not include codes in URLs or application logs.

The invitation record contains a hash, expiry and redemption/revocation times.
Signup redeems the code and creates the account and grant in one transaction.
For an unused code, run `python -m app.beta_admin revoke-invite` and enter it at
the prompt. Revoke an account with `python -m app.beta_admin revoke tester@example.com`.
Its current cookie stops authorizing protected API requests while access is revoked.
The CLI is for a trusted operator with access to the API host/database.

Do not turn off the beta flag on an internet-facing host as a rollback. First
remove public ingress, then restore the last known good deployment. Downgrading
to `3bd80a2749c1` drops the invite and grant tables; it does not delete existing
accounts or projects.
