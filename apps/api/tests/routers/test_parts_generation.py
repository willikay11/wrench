import json
import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

MOCK_USER = {"id": "user-123", "access_token": "token-123"}
MOCK_BUILD_ID = "build-123"


@pytest.fixture
def mock_supabase():
    """Mock Supabase client"""
    with patch("app.routers.builds.get_supabase") as mock:
        yield mock


@pytest.fixture
def mock_auth():
    """Mock authentication"""
    with patch("app.routers.builds.get_current_user") as mock:
        mock.return_value = MOCK_USER
        yield mock


class TestGeneratePartsForBuild:
    """Test POST /v1/builds/{id}/parts/generate endpoint"""

    def test_generate_parts_returns_200_with_parts(self, mock_supabase, mock_auth):
        """POST /parts/generate returns 200 with generated parts"""
        mock_sb = MagicMock()
        mock_supabase.return_value = mock_sb

        build_data = {
            "id": MOCK_BUILD_ID,
            "user_id": MOCK_USER["id"],
            "donor_car": "Honda Civic",
            "modification_goal": "engine swap",
            "goals": ["K24 swap"],
            "parts": [],
        }

        generated_parts = {
            "parts": [
                {
                    "id": "part-1",
                    "build_id": MOCK_BUILD_ID,
                    "name": "K24A2",
                    "description": "JDM engine",
                    "category": "engine",
                    "goal": "K24 swap",
                    "status": "needed",
                    "price_estimate": 1200.00,
                    "vendor_name": "JDM Import",
                    "vendor_url": None,
                    "is_safety_critical": False,
                    "notes": "Check compression",
                    "created_at": "2026-04-20T00:00:00Z",
                    "updated_at": "2026-04-20T00:00:00Z",
                }
            ],
            "summary": {
                "estimated_total": 1200.00,
                "safety_critical_count": 0,
                "message": "Generated K24 swap parts",
            },
        }

        # Mock build select
        mock_builds_table = MagicMock()
        mock_sb.table.return_value = mock_builds_table
        mock_builds_table.select.return_value.eq.return_value.eq.return_value.single.return_value.execute.return_value.data = (
            build_data
        )

        # Mock parts insert/select
        mock_parts_table = MagicMock()
        mock_builds_table.select.return_value.eq.return_value.eq.return_value.single.return_value.execute.return_value.data = (
            {**build_data, "parts": generated_parts["parts"]}
        )

        with patch("app.routers.builds.generate_parts_for_build") as mock_gen:
            mock_gen.return_value = generated_parts

            response = client.post(f"/v1/builds/{MOCK_BUILD_ID}/parts/generate", json={})

            assert response.status_code == 200
            data = response.json()
            assert data["build_id"] == MOCK_BUILD_ID
            assert len(data["parts"]) == 1
            assert data["total_parts"] == 1
            assert data["estimated_total"] == 1200.00

    def test_generate_parts_returns_existing_when_no_force_regenerate(
        self, mock_supabase, mock_auth
    ):
        """Returns existing parts when force_regenerate=False and parts exist"""
        mock_sb = MagicMock()
        mock_supabase.return_value = mock_sb

        existing_parts = [
            {
                "id": "part-1",
                "build_id": MOCK_BUILD_ID,
                "name": "Existing Part",
                "description": "Already here",
                "category": "engine",
                "goal": "swap",
                "status": "needed",
                "price_estimate": 500.00,
                "vendor_name": None,
                "vendor_url": None,
                "is_safety_critical": False,
                "notes": None,
                "created_at": "2026-04-19T00:00:00Z",
                "updated_at": "2026-04-19T00:00:00Z",
            }
        ]

        build_data = {
            "id": MOCK_BUILD_ID,
            "user_id": MOCK_USER["id"],
            "donor_car": "Civic",
            "modification_goal": "swap",
            "goals": ["swap"],
            "parts": existing_parts,
        }

        mock_builds_table = MagicMock()
        mock_sb.table.return_value = mock_builds_table
        mock_builds_table.select.return_value.eq.return_value.eq.return_value.single.return_value.execute.return_value.data = (
            build_data
        )

        response = client.post(
            f"/v1/builds/{MOCK_BUILD_ID}/parts/generate",
            json={"force_regenerate": False},
        )

        assert response.status_code == 200
        data = response.json()
        assert len(data["parts"]) == 1
        assert data["parts"][0]["name"] == "Existing Part"
        assert "Loaded" in data["message"]

    def test_generate_parts_regenerates_when_force_true(self, mock_supabase, mock_auth):
        """Regenerates parts when force_regenerate=True"""
        mock_sb = MagicMock()
        mock_supabase.return_value = mock_sb

        build_data = {
            "id": MOCK_BUILD_ID,
            "user_id": MOCK_USER["id"],
            "donor_car": "Civic",
            "modification_goal": "swap",
            "goals": ["swap"],
            "parts": [{"id": "old-part", "name": "Old Part"}],
        }

        new_parts = {
            "parts": [
                {
                    "name": "New Part",
                    "description": "Freshly generated",
                    "category": "engine",
                    "goal": "swap",
                    "status": "needed",
                    "price_estimate": 800.00,
                    "vendor_name": None,
                    "vendor_url": None,
                    "is_safety_critical": False,
                    "notes": None,
                }
            ],
            "summary": {"estimated_total": 800.00, "safety_critical_count": 0, "message": "New parts"},
        }

        mock_builds_table = MagicMock()
        mock_sb.table.return_value = mock_builds_table
        mock_builds_table.select.return_value.eq.return_value.eq.return_value.single.return_value.execute.return_value.data = (
            build_data
        )

        with patch("app.routers.builds.generate_parts_for_build") as mock_gen:
            mock_gen.return_value = new_parts
            with patch("app.routers.builds._insert_parts") as mock_insert:
                mock_insert.return_value = 1

                # Mock the fresh query to return updated parts
                fresh_call_count = [0]

                def select_side_effect(*args, **kwargs):
                    mock_obj = MagicMock()
                    if fresh_call_count[0] == 0:
                        # First call: initial build check
                        mock_obj.eq.return_value.eq.return_value.single.return_value.execute.return_value.data = (
                            build_data
                        )
                    else:
                        # Second call: fresh parts fetch
                        fresh_data = {
                            **build_data,
                            "parts": [
                                {
                                    "id": "part-new",
                                    "build_id": MOCK_BUILD_ID,
                                    "name": "New Part",
                                    "description": "Freshly generated",
                                    "category": "engine",
                                    "goal": "swap",
                                    "status": "needed",
                                    "price_estimate": 800.00,
                                    "vendor_name": None,
                                    "vendor_url": None,
                                    "is_safety_critical": False,
                                    "notes": None,
                                    "created_at": "2026-04-20T00:00:00Z",
                                    "updated_at": "2026-04-20T00:00:00Z",
                                }
                            ],
                        }
                        mock_obj.eq.return_value.single.return_value.execute.return_value.data = fresh_data
                    fresh_call_count[0] += 1
                    return mock_obj

                mock_sb.table.return_value.select = select_side_effect

                response = client.post(
                    f"/v1/builds/{MOCK_BUILD_ID}/parts/generate",
                    json={"force_regenerate": True},
                )

                assert response.status_code == 200
                # Verify generate was called
                mock_gen.assert_called_once()

    def test_generate_parts_returns_404_when_build_not_found(self, mock_supabase, mock_auth):
        """Returns 404 when build not found"""
        mock_sb = MagicMock()
        mock_supabase.return_value = mock_sb

        mock_builds_table = MagicMock()
        mock_sb.table.return_value = mock_builds_table
        mock_builds_table.select.return_value.eq.return_value.eq.return_value.single.return_value.execute.return_value.data = (
            None
        )

        response = client.post(
            f"/v1/builds/{MOCK_BUILD_ID}/parts/generate", json={}
        )

        assert response.status_code == 404

    def test_generate_parts_returns_503_when_ai_fails(self, mock_supabase, mock_auth):
        """Returns 503 when AI generation fails"""
        mock_sb = MagicMock()
        mock_supabase.return_value = mock_sb

        build_data = {
            "id": MOCK_BUILD_ID,
            "user_id": MOCK_USER["id"],
            "donor_car": "Civic",
            "modification_goal": "swap",
            "goals": ["swap"],
            "parts": [],
        }

        mock_builds_table = MagicMock()
        mock_sb.table.return_value = mock_builds_table
        mock_builds_table.select.return_value.eq.return_value.eq.return_value.single.return_value.execute.return_value.data = (
            build_data
        )

        with patch("app.routers.builds.generate_parts_for_build") as mock_gen:
            from app.services.ai_client import AIClientError

            mock_gen.side_effect = AIClientError("API failed", "groq")

            response = client.post(
                f"/v1/builds/{MOCK_BUILD_ID}/parts/generate", json={}
            )

            assert response.status_code == 503
            assert "Parts generation failed" in response.json()["detail"]


class TestUpdatePart:
    """Test PATCH /v1/builds/{id}/parts/{part_id} endpoint"""

    def test_update_part_returns_200_with_updated_data(self, mock_supabase, mock_auth):
        """PATCH updates part and returns 200"""
        mock_sb = MagicMock()
        mock_supabase.return_value = mock_sb

        # Mock build ownership check
        mock_builds_table = MagicMock()
        mock_sb.table.return_value = mock_builds_table
        mock_builds_table.select.return_value.eq.return_value.eq.return_value.single.return_value.execute.return_value.data = (
            {"id": MOCK_BUILD_ID}
        )

        # Mock part lookup
        part_id = "part-123"
        mock_parts_table = MagicMock()

        def table_side_effect(table_name):
            if table_name == "builds":
                return mock_builds_table
            elif table_name == "parts":
                return mock_parts_table
            return MagicMock()

        mock_sb.table = table_side_effect

        # Mock part exists check
        mock_parts_table.select.return_value.eq.return_value.eq.return_value.single.return_value.execute.return_value.data = (
            {"id": part_id}
        )

        # Mock part update
        updated_part = {
            "id": part_id,
            "build_id": MOCK_BUILD_ID,
            "name": "Part",
            "status": "sourced",
            "vendor_url": "https://example.com",
            "notes": "Updated notes",
        }
        mock_parts_table.update.return_value.eq.return_value.execute.return_value.data = [updated_part]

        response = client.patch(
            f"/v1/builds/{MOCK_BUILD_ID}/parts/{part_id}",
            json={"status": "sourced", "vendor_url": "https://example.com"},
        )

        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "sourced"
        assert data["vendor_url"] == "https://example.com"

    def test_update_part_returns_403_when_not_owner(self, mock_supabase, mock_auth):
        """Returns 403 when user does not own build"""
        mock_sb = MagicMock()
        mock_supabase.return_value = mock_sb

        mock_builds_table = MagicMock()
        mock_sb.table.return_value = mock_builds_table
        # Simulate build not found for this user
        mock_builds_table.select.return_value.eq.return_value.eq.return_value.single.return_value.execute.return_value.data = (
            None
        )

        response = client.patch(
            f"/v1/builds/{MOCK_BUILD_ID}/parts/part-123",
            json={"status": "sourced"},
        )

        assert response.status_code == 403

    def test_update_part_returns_404_when_part_not_found(self, mock_supabase, mock_auth):
        """Returns 404 when part not found"""
        mock_sb = MagicMock()
        mock_supabase.return_value = mock_sb

        # Mock build ownership
        mock_builds_table = MagicMock()
        mock_parts_table = MagicMock()

        def table_side_effect(table_name):
            if table_name == "builds":
                return mock_builds_table
            return mock_parts_table

        mock_sb.table = table_side_effect

        mock_builds_table.select.return_value.eq.return_value.eq.return_value.single.return_value.execute.return_value.data = (
            {"id": MOCK_BUILD_ID}
        )

        # Part not found
        mock_parts_table.select.return_value.eq.return_value.eq.return_value.single.return_value.execute.return_value.data = (
            None
        )

        response = client.patch(
            f"/v1/builds/{MOCK_BUILD_ID}/parts/missing-part",
            json={"status": "sourced"},
        )

        assert response.status_code == 404
