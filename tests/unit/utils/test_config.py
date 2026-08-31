import os

from src.utils.config import Settings, get_settings, normalize_database_url


def test_settings_defaults_local_env_and_version(monkeypatch):
    # Clear env to test defaults
    monkeypatch.delenv("APP_ENV", raising=False)
    monkeypatch.delenv("APP_VERSION", raising=False)

    # Create a fresh instance (bypass cache)
    s = Settings()
    assert s.app_env == "local"
    assert s.app_version == "0.1.0"


def test_settings_respects_env_vars(monkeypatch):
    monkeypatch.setenv("APP_ENV", "dev")
    monkeypatch.setenv("APP_VERSION", "9.9.9")

    # Bypass cache by constructing directly
    s = Settings()
    assert s.app_env == "dev"
    assert s.app_version == "9.9.9"


def test_normalize_database_url_rewrites_postgres_scheme():
    assert (
        normalize_database_url("postgres://u:p@host:5432/db")
        == "postgresql+asyncpg://u:p@host:5432/db"
    )


def test_normalize_database_url_rewrites_postgresql_scheme():
    assert (
        normalize_database_url("postgresql://u:p@host:5432/db")
        == "postgresql+asyncpg://u:p@host:5432/db"
    )


def test_normalize_database_url_leaves_qualified_urls_alone():
    assert normalize_database_url("postgresql+asyncpg://u:p@host/db") == "postgresql+asyncpg://u:p@host/db"
    assert normalize_database_url("sqlite+aiosqlite:///./app.db") == "sqlite+aiosqlite:///./app.db"


def test_settings_normalizes_database_url_from_env(monkeypatch):
    monkeypatch.setenv("DATABASE_URL", "postgres://u:p@host:5432/railway")
    s = Settings()
    assert s.database_url == "postgresql+asyncpg://u:p@host:5432/railway"

