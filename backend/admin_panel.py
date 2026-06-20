"""唯讀資料庫總表瀏覽器（後台）。

提供：
  GET  /admin                     -> 後台頁面 (admin.html)
  GET  /api/admin/tables          -> 列出 public schema 所有資料表 + 筆數
  GET  /api/admin/table/{name}    -> 看單一資料表的欄位與資料（分頁）

全部唯讀，不修改任何資料。資料表名稱一律以 information_schema 取得的
白名單比對，避免 SQL injection。需要 ADMIN_TOKEN 驗證。
"""
import os
from pathlib import Path

from fastapi import APIRouter, Request, HTTPException, Query
from fastapi.responses import FileResponse
from sqlalchemy import text

from database.connection import engine

router = APIRouter()

ADMIN_TOKEN = os.getenv("ADMIN_TOKEN", "")
BASE_DIR = Path(__file__).resolve().parent


def _token_from_request(request: Request) -> str:
    t = request.headers.get("X-Admin-Token")
    if t:
        return t.strip()
    auth = request.headers.get("Authorization", "")
    if auth.lower().startswith("bearer "):
        return auth[7:].strip()
    q = request.query_params.get("token")
    if q:
        return q.strip()
    return ""


def _check(request: Request):
    if not ADMIN_TOKEN:
        raise HTTPException(status_code=500, detail="ADMIN_TOKEN not configured")
    if _token_from_request(request) != ADMIN_TOKEN:
        raise HTTPException(status_code=401, detail="Unauthorized")


async def _table_names(conn) -> list[str]:
    result = await conn.execute(text(
        "SELECT table_name FROM information_schema.tables "
        "WHERE table_schema = 'public' AND table_type = 'BASE TABLE' "
        "ORDER BY table_name"
    ))
    return [r[0] for r in result.fetchall()]


def _jsonify(v):
    if v is None or isinstance(v, (str, int, float, bool)):
        return v
    return str(v)


@router.get("/admin")
async def admin_page():
    return FileResponse(str(BASE_DIR / "admin.html"))


@router.get("/api/admin/tables")
async def list_tables(request: Request):
    _check(request)
    out = []
    async with engine.connect() as conn:
        names = await _table_names(conn)
        for n in names:
            try:
                cnt = await conn.execute(text(f'SELECT COUNT(*) FROM "{n}"'))
                count = cnt.scalar()
            except Exception:
                count = None
            out.append({"name": n, "count": count})
    return {"tables": out}


@router.get("/api/admin/table/{name}")
async def view_table(
    name: str,
    request: Request,
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
):
    _check(request)
    async with engine.connect() as conn:
        names = await _table_names(conn)
        if name not in names:
            raise HTTPException(status_code=404, detail="Table not found")

        total = (await conn.execute(text(f'SELECT COUNT(*) FROM "{name}"'))).scalar()

        colres = await conn.execute(text(
            "SELECT column_name, data_type FROM information_schema.columns "
            "WHERE table_schema = 'public' AND table_name = :t "
            "ORDER BY ordinal_position"
        ), {"t": name})
        cols = [{"name": r[0], "type": r[1]} for r in colres.fetchall()]
        col_names = [c["name"] for c in cols]

        order = ""
        if "id" in col_names:
            order = ' ORDER BY "id" DESC'
        elif "created_at" in col_names:
            order = ' ORDER BY "created_at" DESC'

        rowres = await conn.execute(
            text(f'SELECT * FROM "{name}"{order} LIMIT :lim OFFSET :off'),
            {"lim": limit, "off": offset},
        )
        keys = list(rowres.keys())
        rows = [{k: _jsonify(v) for k, v in zip(keys, r)} for r in rowres.fetchall()]

    return {
        "name": name,
        "columns": cols,
        "rows": rows,
        "total": total,
        "limit": limit,
        "offset": offset,
    }
