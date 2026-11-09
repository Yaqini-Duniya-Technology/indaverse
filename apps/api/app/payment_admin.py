"""Reconcile or inspect a sandbox payment from an authorized API host."""
import argparse
import json

from fastapi import HTTPException
from sqlalchemy import select

from app.database.connection import SessionLocal
from app.models.payments import PaymentAudit
from app.services import payments, paystack


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=("inspect", "reconcile"))
    parser.add_argument("reference")
    args = parser.parse_args()
    if not paystack.REFERENCE.fullmatch(args.reference):
        parser.error("Invalid test payment reference.")
    try:
        with SessionLocal() as db:
            row = payments.lookup(db, args.reference)
            if row is None:
                parser.error("Test payment not found.")
            if args.action == "reconcile":
                if paystack.test_key() is None:
                    parser.error("Sandbox checkout is disabled.")
                print(json.dumps(payments.reconcile(db, args.reference, source="operator")))
            else:
                audit = db.scalars(select(PaymentAudit).where(PaymentAudit.payment_id == row.id)
                                   .order_by(PaymentAudit.id)).all()
                print(json.dumps({**payments.public(row), "audit": [
                    {"event": entry.event, "created_at": entry.created_at.isoformat() + "Z"} for entry in audit
                ]}))
    except HTTPException as exc:
        parser.error(str(exc.detail))


if __name__ == "__main__":
    main()
