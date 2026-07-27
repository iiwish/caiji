import hashlib
import json
from collections.abc import Generator

from sqlalchemy import create_engine, event, select
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from .config import get_settings
from .url_identity import normalize_entry_url


class Base(DeclarativeBase):
    pass


settings = get_settings()
engine = create_engine(
    settings.database_url,
    connect_args={"check_same_thread": False}
    if settings.database_url.startswith("sqlite")
    else {},
)


if settings.database_url.startswith("sqlite"):

    @event.listens_for(engine, "connect")
    def set_sqlite_pragmas(dbapi_connection, _connection_record):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()


SessionLocal = sessionmaker(bind=engine, expire_on_commit=False)


def init_db() -> None:
    from . import models  # noqa: F401

    settings.run_root.mkdir(parents=True, exist_ok=True)
    settings.attachment_root.mkdir(parents=True, exist_ok=True)
    Base.metadata.create_all(bind=engine)
    if engine.dialect.name == "sqlite":
        migrate_sqlite_sites_to_url_identity()
    migrate_article_provenance()


def migrate_sqlite_sites_to_url_identity() -> None:
    connection = engine.raw_connection()
    try:
        cursor = connection.cursor()
        columns = {
            row[1] for row in cursor.execute("PRAGMA table_info(sites)").fetchall()
        }
        indexes = cursor.execute("PRAGMA index_list(sites)").fetchall()
        host_is_unique = any(
            bool(index[2])
            and [
                column[2]
                for column in cursor.execute(
                    f'PRAGMA index_info("{index[1]}")'
                ).fetchall()
            ]
            == ["normalized_host"]
            for index in indexes
        )
        if "normalized_url" in columns and not host_is_unique:
            return

        rows = cursor.execute(
            """
            SELECT id, name, entry_url, normalized_host, folder_id, status,
                   created_at, updated_at
            FROM sites
            """
        ).fetchall()
        cursor.execute("PRAGMA foreign_keys=OFF")
        cursor.execute("DROP TABLE IF EXISTS sites_url_v2")
        cursor.execute(
            """
            CREATE TABLE sites_url_v2 (
                id VARCHAR(40) NOT NULL PRIMARY KEY,
                name VARCHAR(240) NOT NULL,
                entry_url TEXT NOT NULL,
                normalized_url TEXT NOT NULL,
                normalized_host VARCHAR(255) NOT NULL,
                folder_id VARCHAR(40) NOT NULL,
                status VARCHAR(40) NOT NULL,
                created_at DATETIME NOT NULL,
                updated_at DATETIME NOT NULL,
                FOREIGN KEY(folder_id) REFERENCES folders (id)
            )
            """
        )
        cursor.executemany(
            """
            INSERT INTO sites_url_v2 (
                id, name, entry_url, normalized_url, normalized_host, folder_id,
                status, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            [
                (
                    row[0],
                    row[1],
                    row[2],
                    normalize_entry_url(row[2]),
                    row[3],
                    row[4],
                    row[5],
                    row[6],
                    row[7],
                )
                for row in rows
            ],
        )
        cursor.execute("DROP TABLE sites")
        cursor.execute("ALTER TABLE sites_url_v2 RENAME TO sites")
        cursor.execute(
            "CREATE UNIQUE INDEX ix_sites_normalized_url ON sites (normalized_url)"
        )
        cursor.execute(
            "CREATE INDEX ix_sites_normalized_host ON sites (normalized_host)"
        )
        connection.commit()
        cursor.execute("PRAGMA foreign_keys=ON")
    finally:
        connection.close()


def migrate_article_provenance() -> None:
    from .models import Article, ArticleVersion, ExecutionArticle

    with SessionLocal.begin() as session:
        for article in session.scalars(select(Article)):
            version = session.scalar(
                select(ArticleVersion).where(
                    ArticleVersion.article_id == article.id,
                    ArticleVersion.fingerprint == article.fingerprint,
                )
            )
            if version is None:
                version = ArticleVersion(
                    id=f"AV-{hashlib.sha1(article.id.encode()).hexdigest()[:12].upper()}",
                    article_id=article.id,
                    fingerprint=article.fingerprint,
                    title=article.title,
                    published_at=article.published_at,
                    issuer=None,
                    notice_type=None,
                    content_text=article.content_text,
                    raw_html=article.raw_html,
                    source_html=article.raw_html,
                    source_url=article.url,
                    final_url=article.url,
                    source_status_code=0,
                    source_content_type="text/html",
                    source_encoding="utf-8",
                    source_sha256=hashlib.sha256(
                        article.raw_html.encode("utf-8")
                    ).hexdigest(),
                    fetched_at=article.created_at,
                    quality_status="legacy_unverified",
                    quality_checks_json=json.dumps(
                        {"source_snapshot": False},
                        ensure_ascii=False,
                    ),
                    quality_issues_json=json.dumps(
                        ["历史记录缺少完整响应快照，需重新采集"],
                        ensure_ascii=False,
                    ),
                    created_at=article.created_at,
                )
                session.add(version)
                session.flush()
            observation = session.scalar(
                select(ExecutionArticle).where(
                    ExecutionArticle.execution_id == article.execution_id,
                    ExecutionArticle.article_id == article.id,
                )
            )
            if observation is None:
                digest = hashlib.sha1(
                    f"{article.execution_id}|{article.id}".encode()
                ).hexdigest()
                session.add(
                    ExecutionArticle(
                        id=f"EA-{digest[:12].upper()}",
                        execution_id=article.execution_id,
                        article_id=article.id,
                        version_id=version.id,
                        position=0,
                        outcome="inserted",
                        created_at=article.created_at,
                    )
                )


def get_db() -> Generator[Session, None, None]:
    with SessionLocal() as session:
        yield session
