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
    "goals": ["daily", "track"],
    "modification_goal": None,
    "image_url": None,
    "status": "planning",
    "is_public": False,
    "created_at": "2026-01-01T00:00:00+00:00",
    "updated_at": "2026-01-01T00:00:00+00:00",
}

MOCK_PART = {
    "id": "part-001",
    "build_id": "build-001",
    "name": "K24A2 Engine",
    "description": None,
    "category": "engine",
    "status": "needed",
    "price_estimate": 1500.00,
    "vendor_url": None,
    "is_safety_critical": False,
    "notes": None,
    "goal": "K24 engine swap",
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
        assert "car" in build
        assert "status" in build
        assert "created_at" in build
        assert "updated_at" in build


# ── POST /v1/builds ────────────────────────────────────────────────────────

class TestCreateBuild:
    VALID_PAYLOAD = {
        "title": "E30 K24 swap",
        "car": "1991 BMW E30 325i",
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
        assert res.json()["car"] == "1991 BMW E30 325i"
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

    def test_ensures_public_user_profile_exists_before_insert(self, mock_supabase):
        mock_table = mock_supabase.return_value.table.return_value
        mock_table.select.return_value.eq.return_value.execute.return_value.data = []
        mock_table.upsert.return_value.execute.return_value.data = [MOCK_USER]
        mock_table.insert.return_value.execute.return_value.data = [MOCK_BUILD]

        res = client.post(
            "/v1/builds/",
            json=self.VALID_PAYLOAD,
            headers=AUTH_HEADER,
        )

        assert res.status_code == 201
        mock_supabase.return_value.table.assert_any_call("users")
        mock_table.upsert.assert_called_once_with(
            {"id": MOCK_USER["id"], "email": MOCK_USER["email"]},
            on_conflict="id",
        )

    def test_returns_400_when_title_missing(self, mock_supabase):
        res = client.post(
            "/v1/builds/",
            json={"donor_car": "BMW E30"},
            headers=AUTH_HEADER,
        )

        assert res.status_code == 422

    def test_creates_build_with_minimal_payload(self, mock_supabase):
        minimal_build = {**MOCK_BUILD, "donor_car": None, "goals": []}
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


# ── GET /v1/builds/{id} ────────────────────────────────────────────────────────
class TestGetBuild:
    def test_returns_200_with_build_and_parts(self, mock_supabase):
        build_with_parts = {**MOCK_BUILD, "parts": [MOCK_PART]}
        mock_supabase.return_value.table.return_value \
            .select.return_value \
            .eq.return_value \
            .eq.return_value \
            .single.return_value \
            .execute.return_value.data = build_with_parts

        res = client.get("/v1/builds/build-001", headers=AUTH_HEADER)

        assert res.status_code == 200
        assert res.json()["title"] == "E30 K24 swap"
        assert res.json()["id"] == "build-001"
        assert len(res.json()["parts"]) == 1
        assert res.json()["parts"][0]["name"] == "K24A2 Engine"

    def test_computes_parts_total_and_sourced(self, mock_supabase):
        sourced_part = {**MOCK_PART, "id": "part-002", "status": "sourced"}
        build_with_parts = {**MOCK_BUILD, "parts": [MOCK_PART, sourced_part]}
        mock_supabase.return_value.table.return_value \
            .select.return_value \
            .eq.return_value \
            .eq.return_value \
            .single.return_value \
            .execute.return_value.data = build_with_parts

        res = client.get("/v1/builds/build-001", headers=AUTH_HEADER)

        assert res.json()["parts_total"] == 2
        assert res.json()["parts_sourced"] == 1

    def test_filters_by_build_id(self, mock_supabase):
        mock_select = mock_supabase.return_value.table.return_value.select.return_value
        mock_select.eq.return_value \
            .eq.return_value \
            .single.return_value \
            .execute.return_value.data = {**MOCK_BUILD, "parts": []}

        client.get("/v1/builds/build-001", headers=AUTH_HEADER)

        mock_select.eq.return_value.eq.assert_called_once_with("id", "build-001")

    def test_returns_404_when_build_not_found(self, mock_supabase):
        mock_supabase.return_value.table.return_value \
            .select.return_value \
            .eq.return_value \
            .eq.return_value \
            .single.return_value \
            .execute.return_value.data = None

        res = client.get("/v1/builds/build-001", headers=AUTH_HEADER)

        assert res.status_code == 404

    def test_returns_401_without_auth_header(self):
        res = client.get("/v1/builds/build-001")
        assert res.status_code == 401


# ── PUT /v1/builds/{id} ────────────────────────────────────────────────────────
class TestUpdateBuild:
    def test_returns_200_with_updated_build(self, mock_supabase):
        mock_supabase.return_value.table.return_value \
            .select.return_value \
            .eq.return_value \
            .eq.return_value \
            .single.return_value \
            .execute.return_value.data = MOCK_BUILD

        updated_build = {**MOCK_BUILD, "title": "Updated title"}
        mock_supabase.return_value.table.return_value \
            .update.return_value \
            .eq.return_value \
            .execute.return_value.data = [updated_build]

        res = client.put(
            "/v1/builds/build-001",
            json={"title": "Updated title"},
            headers=AUTH_HEADER,
        )

        assert res.status_code == 200
        assert res.json()["title"] == "Updated title"
        assert res.json()["id"] == "build-001"

    def test_returns_404_when_build_not_found(self, mock_supabase):
        mock_supabase.return_value.table.return_value \
            .select.return_value \
            .eq.return_value \
            .eq.return_value \
            .single.return_value \
            .execute.return_value.data = None

        res = client.put(
            "/v1/builds/build-001",
            json={"title": "Updated title"},
            headers=AUTH_HEADER,
        )

        assert res.status_code == 404

    def test_returns_401_without_auth_header(self):
        res = client.put(
            "/v1/builds/build-001",
            json={"title": "Updated title"},
        )
        assert res.status_code == 401

    def test_updates_only_allowed_fields(self, mock_supabase):
        mock_supabase.return_value.table.return_value \
            .select.return_value \
            .eq.return_value \
            .eq.return_value \
            .single.return_value \
            .execute.return_value.data = MOCK_BUILD

        payload = {
            "title": "Updated title",
            "car": "New donor",
            "modification_goal": "Track build with coilovers",
            "goals": ["new goal"],
            "status": "completed",  # This should be ignored
        }

        updated_build = {
            **MOCK_BUILD,
            "title": payload["title"],
            "donor_car": payload["car"],
            "modification_goal": payload["modification_goal"],
            "goals": payload["goals"],
        }
        mock_supabase.return_value.table.return_value \
            .update.return_value \
            .eq.return_value \
            .execute.return_value.data = [updated_build]

        res = client.put(
            "/v1/builds/build-001",
            json=payload,
            headers=AUTH_HEADER,
        )

        assert res.status_code == 200
        assert res.json()["title"] == "Updated title"
        assert res.json()["car"] == "New donor"
        assert res.json()["modification_goal"] == "Track build with coilovers"
        assert res.json()["goals"] == ["new goal"]
        assert res.json()["status"] == "planning"  # Unchanged


# ── PATCH /v1/builds/{id} ────────────────────────────────────────────────────────
class TestPatchBuild:
    def _mock_ownership_check(self, mock_supabase, data=None):
        """Helper to set up the ownership-check select mock."""
        mock_supabase.return_value.table.return_value \
            .select.return_value \
            .eq.return_value \
            .single.return_value \
            .execute.return_value.data = data or {"id": "build-001", "user_id": MOCK_USER["id"]}

    def _mock_fresh_fetch(self, mock_supabase, build_data):
        """Helper to set up the post-update fetch mock."""
        mock_supabase.return_value.table.return_value \
            .select.return_value \
            .eq.return_value \
            .single.return_value \
            .execute.return_value.data = build_data

    def test_returns_200_with_patched_build(self, mock_supabase):
        ownership = {"id": "build-001", "user_id": MOCK_USER["id"]}
        fresh = {**MOCK_BUILD, "parts": [], "title": "Patched title"}

        # First call: ownership check; second call: fresh fetch
        mock_supabase.return_value.table.return_value \
            .select.return_value \
            .eq.return_value \
            .single.return_value \
            .execute.return_value.data = ownership

        mock_supabase.return_value.table.return_value \
            .update.return_value \
            .eq.return_value \
            .execute.return_value.data = [fresh]

        # Override single().execute for the fresh fetch after update
        # Using side_effect to return different values on successive calls
        mock_single = mock_supabase.return_value.table.return_value \
            .select.return_value \
            .eq.return_value \
            .single.return_value
        mock_single.execute.return_value.data = fresh

        res = client.patch(
            "/v1/builds/build-001",
            json={"title": "Patched title"},
            headers=AUTH_HEADER,
        )

        assert res.status_code == 200
        assert res.json()["title"] == "Patched title"
        assert "parts" in res.json()

    def test_returns_404_when_build_not_found(self, mock_supabase):
        mock_supabase.return_value.table.return_value \
            .select.return_value \
            .eq.return_value \
            .single.return_value \
            .execute.return_value.data = None

        res = client.patch(
            "/v1/builds/build-001",
            json={"title": "New title"},
            headers=AUTH_HEADER,
        )

        assert res.status_code == 404

    def test_returns_403_when_build_belongs_to_other_user(self, mock_supabase):
        other_user_build = {"id": "build-001", "user_id": "other-user-id"}
        mock_supabase.return_value.table.return_value \
            .select.return_value \
            .eq.return_value \
            .single.return_value \
            .execute.return_value.data = other_user_build

        res = client.patch(
            "/v1/builds/build-001",
            json={"title": "New title"},
            headers=AUTH_HEADER,
        )

        assert res.status_code == 403

    def test_returns_401_without_auth_header(self):
        res = client.patch("/v1/builds/build-001", json={"title": "New title"})
        assert res.status_code == 401


# ── DELETE /v1/builds/{id} ────────────────────────────────────────────────────────
class TestDeleteBuild:
    def test_returns_204_when_build_deleted(self, mock_supabase):
        mock_supabase.return_value.table.return_value \
            .select.return_value \
            .eq.return_value \
            .eq.return_value \
            .single.return_value \
            .execute.return_value.data = MOCK_BUILD

        mock_supabase.return_value.table.return_value \
            .delete.return_value \
            .eq.return_value \
            .execute.return_value.error = None

        res = client.delete(
            "/v1/builds/build-001",
            headers=AUTH_HEADER,
        )

        assert res.status_code == 204

    def test_returns_404_when_build_not_found(self, mock_supabase):
        mock_supabase.return_value.table.return_value \
            .select.return_value \
            .eq.return_value \
            .eq.return_value \
            .single.return_value \
            .execute.return_value.data = None

        res = client.delete(
            "/v1/builds/build-001",
            headers=AUTH_HEADER,
        )

        assert res.status_code == 404

    def test_returns_401_without_auth_header(self):
        res = client.delete("/v1/builds/build-001")
        assert res.status_code == 401


# ── POST /v1/builds/{id}/image ────────────────────────────────────────────
class TestUploadBuildImage:
    def test_uploads_image_updates_build_and_returns_storage_url(self, mock_supabase):
        mock_table = mock_supabase.return_value.table.return_value
        mock_table.select.return_value \
            .eq.return_value \
            .eq.return_value \
            .single.return_value \
            .execute.return_value.data = MOCK_BUILD

        image_url = "https://example.supabase.co/storage/v1/object/public/build-images/00000000-0000-0000-0000-000000000001/build-001.jpg"
        mock_bucket = mock_supabase.return_value.storage.from_.return_value
        mock_bucket.get_public_url.return_value = image_url

        mock_table.update.return_value \
            .eq.return_value \
            .eq.return_value \
            .execute.return_value.data = [{**MOCK_BUILD, "image_url": image_url}]

        res = client.post(
            "/v1/builds/build-001/image",
            headers=AUTH_HEADER,
            files={"image": ("build.jpg", b"fake-image-bytes", "image/jpeg")},
        )

        assert res.status_code == 201
        assert res.json() == {"image_url": image_url}
        mock_bucket.upload.assert_called_once_with(
            f"{MOCK_USER['id']}/build-001.jpg",
            b"fake-image-bytes",
            file_options={
                "content-type": "image/jpeg",
                "upsert": "true",
            },
        )

    def test_returns_404_when_build_not_found(self, mock_supabase):
        mock_supabase.return_value.table.return_value \
            .select.return_value \
            .eq.return_value \
            .eq.return_value \
            .single.return_value \
            .execute.return_value.data = None

        res = client.post(
            "/v1/builds/build-001/image",
            headers=AUTH_HEADER,
            files={"image": ("build.jpg", b"fake-image-bytes", "image/jpeg")},
        )

        assert res.status_code == 404

    def test_rejects_non_image_uploads(self, mock_supabase):
        mock_supabase.return_value.table.return_value \
            .select.return_value \
            .eq.return_value \
            .eq.return_value \
            .single.return_value \
            .execute.return_value.data = MOCK_BUILD

        res = client.post(
            "/v1/builds/build-001/image",
            headers=AUTH_HEADER,
            files={"image": ("notes.txt", b"not-an-image", "text/plain")},
        )

        assert res.status_code == 400
        assert res.json()["detail"] == "Uploaded file must be an image"

    def test_returns_storage_error_detail_when_upload_fails(self, mock_supabase):
        mock_table = mock_supabase.return_value.table.return_value
        mock_table.select.return_value \
            .eq.return_value \
            .eq.return_value \
            .single.return_value \
            .execute.return_value.data = MOCK_BUILD

        mock_bucket = mock_supabase.return_value.storage.from_.return_value
        mock_bucket.upload.side_effect = Exception("Bucket not found")

        res = client.post(
            "/v1/builds/build-001/image",
            headers=AUTH_HEADER,
            files={"image": ("build.jpg", b"fake-image-bytes", "image/jpeg")},
        )

        assert res.status_code == 500
        assert "Bucket not found" in res.json()["detail"]
