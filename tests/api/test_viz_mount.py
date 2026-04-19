import pathlib
from fastapi.testclient import TestClient


def test_viz_returns_placeholder_when_dist_missing(tmp_path, monkeypatch):
    """When apps/dsa-viz/dist is missing, /viz/ returns 404 (graceful, not 500)."""
    from api.app import create_app
    monkeypatch.chdir(tmp_path)
    app = create_app()
    client = TestClient(app)
    response = client.get("/viz/")
    assert response.status_code == 404


def test_viz_serves_index_when_dist_present(tmp_path, monkeypatch):
    """When dist/index.html exists, /viz/ returns it."""
    viz_root = tmp_path / "apps" / "dsa-viz" / "dist"
    viz_root.mkdir(parents=True)
    (viz_root / "index.html").write_text("<html>VIZ</html>", encoding="utf-8")

    monkeypatch.setenv("DSA_VIZ_DIST", str(viz_root))
    from api.app import create_app
    app = create_app()
    client = TestClient(app)
    response = client.get("/viz/")
    assert response.status_code == 200
    assert "VIZ" in response.text
