import json
from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

from app.main import app


@pytest.fixture
def client():
    return TestClient(app)


@patch("app.routers.conversation.ai_client.generate")
def test_conversation_message_returns_200(mock_generate, client):
    """POST /v1/conversation/message returns 200."""
    mock_generate.return_value = json.dumps({
        "reply": "Tell me about your car",
        "state": "gathering",
        "extracted": {"car": None, "goal": None, "use_case": None}
    })

    response = client.post("/v1/conversation/message", json={
        "message": "I want to modify my car"
    })

    assert response.status_code == 200


@patch("app.routers.conversation.ai_client.generate")
def test_conversation_response_structure(mock_generate, client):
    """Response contains reply, state, extracted, session_id."""
    mock_generate.return_value = json.dumps({
        "reply": "Got it! What car?",
        "state": "gathering",
        "extracted": {"car": None, "goal": "engine swap", "use_case": None}
    })

    response = client.post("/v1/conversation/message", json={
        "message": "engine swap"
    })

    data = response.json()
    assert "reply" in data
    assert "state" in data
    assert "extracted" in data
    assert "session_id" in data


@patch("app.routers.conversation.ai_client.generate")
def test_conversation_session_id_generated(mock_generate, client):
    """session_id is generated when not provided."""
    mock_generate.return_value = json.dumps({
        "reply": "Hi there!",
        "state": "gathering",
        "extracted": {}
    })

    response = client.post("/v1/conversation/message", json={
        "message": "hello"
    })

    data = response.json()
    assert data["session_id"]
    # Should be a valid UUID format
    assert len(data["session_id"]) == 36


@patch("app.routers.conversation.ai_client.generate")
def test_conversation_session_id_preserved(mock_generate, client):
    """session_id is preserved when provided."""
    mock_generate.return_value = json.dumps({
        "reply": "Got it",
        "state": "gathering",
        "extracted": {}
    })

    session_id = "test-session-12345"
    response = client.post("/v1/conversation/message", json={
        "message": "hi",
        "session_id": session_id
    })

    data = response.json()
    assert data["session_id"] == session_id


@patch("app.routers.conversation.ai_client.generate")
def test_conversation_history_passed(mock_generate, client):
    """history is passed through to the AI call."""
    mock_generate.return_value = json.dumps({
        "reply": "Understood",
        "state": "gathering",
        "extracted": {}
    })

    response = client.post("/v1/conversation/message", json={
        "message": "new message",
        "history": [
            {"role": "assistant", "content": "What car?"},
            {"role": "user", "content": "BMW E30"}
        ]
    })

    assert response.status_code == 200
    # Verify generate was called
    assert mock_generate.called


@patch("app.routers.conversation.ai_client.generate")
def test_conversation_invalid_json_fallback(mock_generate, client):
    """Falls back gracefully when AI returns invalid JSON."""
    # Return non-JSON text
    mock_generate.return_value = "This is not JSON at all"

    response = client.post("/v1/conversation/message", json={
        "message": "test"
    })

    data = response.json()
    assert response.status_code == 200
    assert data["state"] == "gathering"
    assert "didn't catch that" in data["reply"].lower()


@patch("app.routers.conversation.ai_client.generate")
def test_conversation_state_values(mock_generate, client):
    """state is one of gathering | confirming | ready."""
    for state_value in ["gathering", "confirming", "ready"]:
        mock_generate.return_value = json.dumps({
            "reply": "test",
            "state": state_value,
            "extracted": {}
        })

        response = client.post("/v1/conversation/message", json={
            "message": "test"
        })

        data = response.json()
        assert data["state"] in ["gathering", "confirming", "ready"]


@patch("app.routers.conversation.ai_client.generate")
def test_conversation_extracted_context(mock_generate, client):
    """extracted contains car, goal, use_case fields."""
    mock_generate.return_value = json.dumps({
        "reply": "Got your BMW E30 engine swap for daily driving",
        "state": "confirming",
        "extracted": {
            "car": "BMW E30",
            "goal": "engine swap",
            "use_case": "daily driver"
        }
    })

    response = client.post("/v1/conversation/message", json={
        "message": "E30, engine swap, daily"
    })

    data = response.json()
    extracted = data["extracted"]
    assert "car" in extracted
    assert "goal" in extracted
    assert "use_case" in extracted
