"""Manage credit grants and prepaid plan periods from a trusted API host."""
import argparse
from datetime import UTC, datetime

from fastapi import HTTPException
from sqlalchemy import select

from app.core.credit_policy import PLAN_KEYS
from app.database.connection import SessionLocal
from app.models.user import User
from app.services.credits import assign_plan, grant_credits, reverse_credits


def utc_datetime(value: str):
    try:
        stamp = datetime.fromisoformat(value)
        if stamp.utcoffset() is None:
            raise ValueError
        return stamp.astimezone(UTC).replace(tzinfo=None)
    except ValueError:
        raise argparse.ArgumentTypeError("Enter an ISO timestamp with an offset, e.g. 2027-01-01T00:00:00Z.") from None


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    actions = parser.add_subparsers(dest="action", required=True)
    grant = actions.add_parser("grant")
    reverse = actions.add_parser("reverse")
    plan = actions.add_parser("plan")
    for command in (grant, reverse, plan):
        command.add_argument("email")
        command.add_argument("reference", help="Stable, opaque operation ID (do not include private data).")
    grant.add_argument("source", choices=("purchase", "promotion", "adjustment", "subscription"))
    grant.add_argument("amount", type=int)
    grant.add_argument("--expires", type=utc_datetime)
    reverse.add_argument("grant_reference")
    reverse.add_argument("amount", type=int)
    plan.add_argument("key", choices=[key for key in PLAN_KEYS if key != "free"])
    plan.add_argument("period", choices=("monthly", "annual"))
    plan.add_argument("period_end", type=utc_datetime)
    args = parser.parse_args()
    try:
        with SessionLocal.begin() as db:
            user_id = db.scalar(select(User.id).where(User.email == args.email.lower()))
            if user_id is None:
                parser.error("No account matches that email.")
            if args.action == "grant":
                grant_credits(db, user_id, args.reference, args.source, args.amount, args.expires)
            elif args.action == "reverse":
                reverse_credits(db, user_id, args.grant_reference, args.reference, args.amount)
            else:
                assign_plan(db, user_id, args.reference, args.key, args.period, args.period_end)
    except (HTTPException, ValueError) as exc:
        parser.error(exc.detail if isinstance(exc, HTTPException) else str(exc))
    print("Credit operation recorded.")


if __name__ == "__main__":
    main()
