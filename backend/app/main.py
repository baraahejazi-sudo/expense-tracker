from __future__ import annotations

import json
import os
import tempfile
from datetime import date, datetime, timezone
from decimal import Decimal, ROUND_HALF_UP
from enum import Enum
from pathlib import Path
from threading import RLock
from typing import Annotated
from uuid import uuid4

from fastapi import FastAPI, HTTPException, Query, Response, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, ConfigDict, Field, field_validator

TWOPLACES = Decimal("0.01")


class TransactionType(str, Enum):
    INCOME = "income"
    EXPENSE = "expense"


class Category(str, Enum):
    SALARY = "salary"
    HOUSING = "housing"
    FOOD = "food"
    TRANSPORT = "transport"
    SHOPPING = "shopping"
    LEISURE = "leisure"
    HEALTH = "health"
    EDUCATION = "education"
    OTHER = "other"


class TransactionInput(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    title: str = Field(min_length=2, max_length=100)
    amount: Decimal = Field(gt=0, max_digits=12, decimal_places=2)
    type: TransactionType
    category: Category
    date: date
    notes: str | None = Field(default=None, max_length=300)

    @field_validator("amount")
    @classmethod
    def normalize_amount(cls, value: Decimal) -> Decimal:
        return value.quantize(TWOPLACES, rounding=ROUND_HALF_UP)

    @field_validator("notes")
    @classmethod
    def normalize_notes(cls, value: str | None) -> str | None:
        if value is None:
            return None
        value = value.strip()
        return value or None


class Transaction(TransactionInput):
    id: str
    created_at: datetime
    updated_at: datetime


class Summary(BaseModel):
    income: Decimal
    expenses: Decimal
    balance: Decimal
    transaction_count: int
    category_totals: dict[str, Decimal]


class Health(BaseModel):
    status: str
    storage: str


class FileTransactionRepository:
    """Small JSON repository with process-local locking and atomic file replacement."""

    def __init__(self, data_file: Path) -> None:
        self.data_file = data_file
        self._lock = RLock()
        self.data_file.parent.mkdir(parents=True, exist_ok=True)
        if not self.data_file.exists():
            self._write([])

    def _read(self) -> list[dict]:
        with self._lock:
            try:
                content = self.data_file.read_text(encoding="utf-8")
                raw = json.loads(content or "[]")
            except (OSError, json.JSONDecodeError) as exc:
                raise RuntimeError(f"Could not read transaction storage: {exc}") from exc

            if not isinstance(raw, list):
                raise RuntimeError("Transaction storage must contain a JSON array")
            return raw

    def _write(self, items: list[dict]) -> None:
        payload = json.dumps(items, ensure_ascii=False, indent=2)
        with self._lock:
            self.data_file.parent.mkdir(parents=True, exist_ok=True)
            tmp_path: Path | None = None
            try:
                with tempfile.NamedTemporaryFile(
                    mode="w",
                    encoding="utf-8",
                    dir=self.data_file.parent,
                    prefix=f".{self.data_file.name}.",
                    suffix=".tmp",
                    delete=False,
                ) as handle:
                    handle.write(payload)
                    handle.flush()
                    os.fsync(handle.fileno())
                    tmp_path = Path(handle.name)
                os.replace(tmp_path, self.data_file)
            except OSError as exc:
                if tmp_path and tmp_path.exists():
                    tmp_path.unlink(missing_ok=True)
                raise RuntimeError(f"Could not write transaction storage: {exc}") from exc

    def list(self) -> list[Transaction]:
        return [Transaction.model_validate(item) for item in self._read()]

    def create(self, payload: TransactionInput) -> Transaction:
        with self._lock:
            now = datetime.now(timezone.utc)
            transaction = Transaction(
                id=f"txn_{uuid4().hex[:12]}",
                created_at=now,
                updated_at=now,
                **payload.model_dump(),
            )
            items = self._read()
            items.append(transaction.model_dump(mode="json"))
            self._write(items)
            return transaction

    def update(self, transaction_id: str, payload: TransactionInput) -> Transaction | None:
        with self._lock:
            items = self._read()
            for index, item in enumerate(items):
                if item.get("id") != transaction_id:
                    continue
                existing = Transaction.model_validate(item)
                updated = Transaction(
                    id=existing.id,
                    created_at=existing.created_at,
                    updated_at=datetime.now(timezone.utc),
                    **payload.model_dump(),
                )
                items[index] = updated.model_dump(mode="json")
                self._write(items)
                return updated
            return None

    def delete(self, transaction_id: str) -> bool:
        with self._lock:
            items = self._read()
            remaining = [item for item in items if item.get("id") != transaction_id]
            if len(remaining) == len(items):
                return False
            self._write(remaining)
            return True


def _default_data_file() -> Path:
    configured = os.getenv("EXPENSE_TRACKER_DATA_FILE")
    if configured:
        return Path(configured).expanduser().resolve()
    return Path(__file__).resolve().parents[1] / "data" / "transactions.json"


def _allowed_origins() -> list[str]:
    configured = os.getenv("EXPENSE_TRACKER_CORS_ORIGINS", "http://localhost:5173")
    return [origin.strip() for origin in configured.split(",") if origin.strip()]


def _filter_transactions(
    transactions: list[Transaction],
    transaction_type: TransactionType | None,
    category: Category | None,
    month: str | None,
    search: str | None,
) -> list[Transaction]:
    result = transactions

    if transaction_type:
        result = [item for item in result if item.type == transaction_type]
    if category:
        result = [item for item in result if item.category == category]
    if month:
        result = [item for item in result if item.date.strftime("%Y-%m") == month]
    if search:
        needle = search.casefold()
        result = [
            item
            for item in result
            if needle in item.title.casefold()
            or (item.notes is not None and needle in item.notes.casefold())
        ]

    return sorted(result, key=lambda item: (item.date, item.created_at), reverse=True)


def _calculate_summary(transactions: list[Transaction]) -> Summary:
    income = sum(
        (item.amount for item in transactions if item.type == TransactionType.INCOME),
        Decimal("0.00"),
    )
    expenses = sum(
        (item.amount for item in transactions if item.type == TransactionType.EXPENSE),
        Decimal("0.00"),
    )

    category_totals: dict[str, Decimal] = {}
    for item in transactions:
        if item.type != TransactionType.EXPENSE:
            continue
        category_totals[item.category.value] = (
            category_totals.get(item.category.value, Decimal("0.00")) + item.amount
        ).quantize(TWOPLACES)

    return Summary(
        income=income.quantize(TWOPLACES),
        expenses=expenses.quantize(TWOPLACES),
        balance=(income - expenses).quantize(TWOPLACES),
        transaction_count=len(transactions),
        category_totals=dict(
            sorted(category_totals.items(), key=lambda pair: pair[1], reverse=True)
        ),
    )


def create_app(data_file: Path | None = None) -> FastAPI:
    app = FastAPI(
        title="Expense Tracker API",
        version="1.0.0",
        description="REST API for a small personal income and expense tracker.",
    )
    repository = FileTransactionRepository(data_file or _default_data_file())
    app.state.repository = repository

    app.add_middleware(
        CORSMiddleware,
        allow_origins=_allowed_origins(),
        allow_credentials=False,
        allow_methods=["GET", "POST", "PUT", "DELETE"],
        allow_headers=["Content-Type"],
    )

    @app.get("/api/health", response_model=Health, tags=["system"])
    def health() -> Health:
        return Health(status="ok", storage="json")

    @app.get("/api/transactions", response_model=list[Transaction], tags=["transactions"])
    def list_transactions(
        transaction_type: Annotated[TransactionType | None, Query(alias="type")] = None,
        category: Category | None = None,
        month: Annotated[
            str | None,
            Query(pattern=r"^\d{4}-(0[1-9]|1[0-2])$"),
        ] = None,
        search: Annotated[str | None, Query(min_length=1, max_length=100)] = None,
    ) -> list[Transaction]:
        return _filter_transactions(
            repository.list(), transaction_type, category, month, search
        )

    @app.post(
        "/api/transactions",
        response_model=Transaction,
        status_code=status.HTTP_201_CREATED,
        tags=["transactions"],
    )
    def create_transaction(payload: TransactionInput) -> Transaction:
        return repository.create(payload)

    @app.put(
        "/api/transactions/{transaction_id}",
        response_model=Transaction,
        tags=["transactions"],
    )
    def update_transaction(transaction_id: str, payload: TransactionInput) -> Transaction:
        updated = repository.update(transaction_id, payload)
        if updated is None:
            raise HTTPException(status_code=404, detail="Transaction not found")
        return updated

    @app.delete(
        "/api/transactions/{transaction_id}",
        status_code=status.HTTP_204_NO_CONTENT,
        tags=["transactions"],
    )
    def delete_transaction(transaction_id: str) -> Response:
        if not repository.delete(transaction_id):
            raise HTTPException(status_code=404, detail="Transaction not found")
        return Response(status_code=status.HTTP_204_NO_CONTENT)

    @app.get("/api/summary", response_model=Summary, tags=["analytics"])
    def summary(
        month: Annotated[
            str | None,
            Query(pattern=r"^\d{4}-(0[1-9]|1[0-2])$"),
        ] = None,
    ) -> Summary:
        transactions = repository.list()
        if month:
            transactions = [
                item for item in transactions if item.date.strftime("%Y-%m") == month
            ]
        return _calculate_summary(transactions)

    return app


app = create_app()
