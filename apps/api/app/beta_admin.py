"""Manage beta access from the host. This module does not expose an HTTP admin route."""
import argparse
from hashlib import sha256
from getpass import getpass

from pydantic import EmailStr, TypeAdapter, ValidationError
from sqlalchemy import select

from app.database.connection import SessionLocal
from app.models.beta_access import BetaAccess, BetaInvite
from app.models.user import User
from app.services.beta_access import issue_invite, now


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    actions = parser.add_subparsers(dest="action", required=True)
    issue = actions.add_parser("invite")
    issue.add_argument("email")
    issue.add_argument("--hours", type=int, default=72, choices=range(1, 169), metavar="1-168")
    actions.add_parser("revoke-invite")
    for action in ("grant", "revoke"):
        actions.add_parser(action).add_argument("email")
    args = parser.parse_args()
    if hasattr(args, "email"):
        try:
            email = TypeAdapter(EmailStr).validate_python(args.email).lower()
        except ValidationError:
            parser.error("Enter a valid email address.")

    with SessionLocal.begin() as db:
        if args.action == "invite":
            token = issue_invite(db, email, args.hours)
        elif args.action == "revoke-invite":
            token = getpass("Invite code: ").strip()
            invite = db.get(BetaInvite, sha256(token.encode()).hexdigest(), with_for_update=True)
            if invite is None or invite.redeemed_at is not None:
                parser.error("No unused invitation matches that code.")
            if invite.revoked_at is None:
                invite.revoked_at = now()
        else:
            user_id = db.scalar(select(User.id).where(User.email == email).with_for_update())
            if user_id is None:
                parser.error("No existing account matches that email.")
            grant = db.get(BetaAccess, user_id)
            if args.action == "grant":
                if grant is None:
                    db.add(BetaAccess(user_id=user_id, granted_at=now()))
                elif grant.revoked_at is not None:
                    grant.granted_at = now()
                    grant.revoked_at = None
            elif grant is not None and grant.revoked_at is None:
                grant.revoked_at = now()
    if args.action == "invite":
        print(token)
    else:
        print("Beta access updated.")


if __name__ == "__main__":
    main()
