# apps/api/tests/routers/test_builds.py
import pytest
from fastapi.testclient import TestClient
from unittest.mock import patch, MagicMock
from app.main import app

client = TestClient(app)

# ── Fixtures ───────────────────────────────────────────────────────────────

MOCK_USER = {
    "id": "00000000-0000-0000-0000-000000000001",
    "email": "will@wrench.app",
}

MOCK_BUILD = {
    "id": "build-001",
    "user_id": MOCK_USER["id"],
    "title": "E30 K24 swap",
    "donor_car": "1991 BMW E30 325i",
    "engine_swap": "Honda K24A2",
    "goals": ["daily", "track"],
    "image_url": None,
    "status": "planning",
    "is_public": False,
    "created_at": "2026-01-01T00:00:00+00:00",
    "updated_at": "2026-01-01T00:00:00+00:00",
}

AUTH_HEADER = {"Authorization": "Bearer valid-test-token"}


@pytest.fixture(autouse=True)
def mock_auth():
    """
    Patches the auth dependency's Supabase call for every test in this file.
    This preserves FastAPI's HTTPBearer behavior for missing headers while
    preventing real JWT verification against the Supabase API.
    """
    with patch("app.core.dependencies.get_supabase") as mock_get_supabase:
        mock_user = MagicMock()
        mock_user.id = MOCK_USER["id"]
        mock_user.email = MOCK_USER["email"]

        mock_response = MagicMock()
        mock_response.user = mock_user

        mock_get_supabase.return_value.auth.get_user.return_value = mock_response
        yield


@pytest.fixture
def mock_supabase():
    with patch("app.routers.builds.get_supabase") as mock:
        yield mock


# ── GET /v1/builds ─────────────────────────────────────────────────────────

class TestListBuilds:
    def test_returns_200_with_builds(self, mock_supabase):
        mock_supabase.return_value.table.return_value \
            .select.return_value \
            .eq.return_value \
            .order.return_value \
            .execute.return_value.data = [MOCK_BUILD]

        res = client.get("/v1/builds/", headers=AUTH_HEADER)

        assert res.status_code == 200
        assert len(res.json()) == 1
        assert res.json()[0]["title"] == "E30 K24 swap"

    def test_returns_empty_list_when_no_builds(self, mock_supabase):
        mock_supabase.return_value.table.return_value \
            .select.return_value \
            .eq.return_value \
            .order.return_value \
            .execute.return_value.data = []

        res = client.get("/v1/builds/", headers=AUTH_HEADER)

        assert res.status_code == 200
        assert res.json() == []

    def test_filters_by_user_id(self, mock_supabase):
        mock_table = mock_supabase.return_value.table.return_value
        mock_table.select.return_value \
            .eq.return_value \
            .order.return_value \
            .execute.return_value.data = []

        client.get("/v1/builds/", headers=AUTH_HEADER)

        mock_table.select.return_value.eq.assert_called_once_with(
            "user_id", MOCK_USER["id"]
        )

    def test_returns_401_without_auth_header(self):
        res = client.get("/v1/builds/")
        assert res.status_code == 401

    def test_builds_ordered_by_created_at_desc(self, mock_supabase):
        mock_select = mock_supabase.return_value.table.return_value.select.return_value
        mock_select.eq.return_value \
            .order.return_value \
            .execute.return_value.data = []

        client.get("/v1/builds/", headers=AUTH_HEADER)

        mock_select.eq.return_value.order.assert_called_once_with(
            "created_at", desc=True
        )

    def test_response_shape_matches_build_response_model(self, mock_supabase):
        mock_supabase.return_value.table.return_value \
            .select.return_value \
            .eq.return_value \
            .order.return_value \
            .execute.return_value.data = [MOCK_BUILD]

        res = client.get("/v1/builds/", headers=AUTH_HEADER)
        build = res.json()[0]

        assert "id" in build
        assert "user_id" in build
        assert "title" in build
        assert "status" in build
        assert "created_at" in build
        assert "updated_at" in build


# ── POST /v1/builds ────────────────────────────────────────────────────────

class TestCreateBuild:
    VALID_PAYLOAD = {
        "title": "E30 K24 swap",
        "donor_car": "1991 BMW E30 325i",
        "engine_swap": "Honda K24A2",
        "goals": ["daily", "track"],
    }

    def test_returns_201_on_success(self, mock_supabase):
        mock_supabase.return_value.table.return_value \
            .insert.return_value \
            .execute.return_value.data = [MOCK_BUILD]

        res = client.post(
            "/v1/builds/",
            json=self.VALID_PAYLOAD,
            headers=AUTH_HEADER,
        )

        assert res.status_code == 201

    def test_returns_created_build(self, mock_supabase):
        mock_supabase.return_value.table.return_value \
            .insert.return_value \
            .execute.return_value.data = [MOCK_BUILD]

        res = client.post(
            "/v1/builds/",
            json=self.VALID_PAYLOAD,
            headers=AUTH_HEADER,
        )

        assert res.json()["title"] == "E30 K24 swap"
        assert res.json()["user_id"] == MOCK_USER["id"]

    def test_sets_user_id_from_token_not_payload(self, mock_supabase):
        mock_insert = mock_supabase.return_value.table.return_value.insert
        mock_insert.return_value.execute.return_value.data = [MOCK_BUILD]

        client.post(
            "/v1/builds/",
            json=self.VALID_PAYLOAD,
            headers=AUTH_HEADER,
        )

        inserted_data = mock_insert.call_args[0][0]
        assert inserted_data["user_id"] == MOCK_USER["id"]

    def test_returns_400_when_title_missing(self, mock_supabase):
        res = client.post(
            "/v1/builds/",
            json={"donor_car": "BMW E30"},
            headers=AUTH_HEADER,
        )

        assert res.status_code == 422

    def test_creates_build_with_minimal_payload(self, mock_supabase):
        minimal_build = {**MOCK_BUILD, "donor_car": None, "engine_swap": None, "goals": []}
        mock_supabase.return_value.table.return_value \
            .insert.return_value \
            .execute.return_value.data = [minimal_build]

        res = client.post(
            "/v1/builds/",
            json={"title": "New build"},
            headers=AUTH_HEADER,
        )

        assert res.status_code == 201

    def test_returns_500_when_supabase_insert_fails(self, mock_supabase):
        mock_supabase.return_value.table.return_value \
            .insert.return_value \
            .execute.return_value.data = []

        res = client.post(
            "/v1/builds/",
            json=self.VALID_PAYLOAD,
            headers=AUTH_HEADER,
        )

        assert res.status_code == 500

    def test_returns_401_without_auth_header(self):
        res = client.post("/v1/builds/", json=self.VALID_PAYLOAD)
        assert res.status_code == 401