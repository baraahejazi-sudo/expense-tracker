from decimal import Decimal
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.main import create_app


@pytest.fixture()
def client(tmp_path: Path) -> TestClient:
    app = create_app(tmp_path / "transactions.json")
    return TestClient(app)


def transaction_payload(**overrides):
    payload = {
        "title": "Groceries",
        "amount": "42.50",
        "type": "expense",
        "category": "food",
        "date": "2026-10-02",
        "notes": "Weekly shop",
    }
    payload.update(overrides)
    return payload


def test_health(client: TestClient):
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "storage": "json"}


def test_create_and_list_transaction(client: TestClient):
    created = client.post("/api/transactions", json=transaction_payload())
    assert created.status_code == 201
    body = created.json()
    assert body["id"].startswith("txn_")
    assert body["amount"] == "42.50"

    listed = client.get("/api/transactions")
    assert listed.status_code == 200
    assert len(listed.json()) == 1
    assert listed.json()[0]["title"] == "Groceries"


def test_update_transaction(client: TestClient):
    transaction = client.post("/api/transactions", json=transaction_payload()).json()

    response = client.put(
        f"/api/transactions/{transaction['id']}",
        json=transaction_payload(title="Updated groceries", amount="49.90"),
    )

    assert response.status_code == 200
    assert response.json()["title"] == "Updated groceries"
    assert response.json()["amount"] == "49.90"
    assert response.json()["created_at"] == transaction["created_at"]


def test_delete_transaction(client: TestClient):
    transaction = client.post("/api/transactions", json=transaction_payload()).json()

    response = client.delete(f"/api/transactions/{transaction['id']}")

    assert response.status_code == 204
    assert client.get("/api/transactions").json() == []


def test_missing_transaction_returns_404(client: TestClient):
    response = client.delete("/api/transactions/txn_missing")
    assert response.status_code == 404
    assert response.json()["detail"] == "Transaction not found"


def test_validation_rejects_negative_amount(client: TestClient):
    response = client.post(
        "/api/transactions", json=transaction_payload(amount="-10.00")
    )
    assert response.status_code == 422


def test_summary_calculates_income_expenses_and_balance(client: TestClient):
    client.post(
        "/api/transactions",
        json=transaction_payload(
            title="Salary", amount="2500.00", type="income", category="salary"
        ),
    )
    client.post(
        "/api/transactions",
        json=transaction_payload(title="Rent", amount="900.00", category="housing"),
    )
    client.post(
        "/api/transactions",
        json=transaction_payload(title="Food", amount="100.25", category="food"),
    )

    response = client.get("/api/summary")

    assert response.status_code == 200
    summary = response.json()
    assert Decimal(summary["income"]) == Decimal("2500.00")
    assert Decimal(summary["expenses"]) == Decimal("1000.25")
    assert Decimal(summary["balance"]) == Decimal("1499.75")
    assert summary["transaction_count"] == 3
    assert Decimal(summary["category_totals"]["housing"]) == Decimal("900.00")


def test_filters_by_type_category_month_and_search(client: TestClient):
    client.post(
        "/api/transactions",
        json=transaction_payload(title="October food", date="2026-10-02"),
    )
    client.post(
        "/api/transactions",
        json=transaction_payload(
            title="September train",
            amount="70.00",
            category="transport",
            date="2026-09-20",
        ),
    )
    client.post(
        "/api/transactions",
        json=transaction_payload(
            title="October salary",
            amount="3000.00",
            type="income",
            category="salary",
            date="2026-10-01",
        ),
    )

    expenses = client.get("/api/transactions?type=expense").json()
    assert len(expenses) == 2

    food = client.get("/api/transactions?category=food").json()
    assert [item["title"] for item in food] == ["October food"]

    october = client.get("/api/transactions?month=2026-10").json()
    assert len(october) == 2

    searched = client.get("/api/transactions?search=train").json()
    assert [item["title"] for item in searched] == ["September train"]


def test_monthly_summary_only_uses_requested_month(client: TestClient):
    client.post(
        "/api/transactions",
        json=transaction_payload(title="October", amount="20.00", date="2026-10-02"),
    )
    client.post(
        "/api/transactions",
        json=transaction_payload(title="September", amount="10.00", date="2026-09-02"),
    )

    response = client.get("/api/summary?month=2026-10")

    assert response.status_code == 200
    assert response.json()["expenses"] == "20.00"
    assert response.json()["transaction_count"] == 1
