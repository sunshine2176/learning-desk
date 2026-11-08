#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""小满学习台 · 本地服务

零第三方依赖，只用 Python 标准库（http.server + sqlite3）。
启动：python3 server.py
iPad 访问：http://<本机局域网IP>:8777
"""

import json
import os
import random
import socket
import sqlite3
import sys
import datetime
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from urllib.parse import urlparse, parse_qs, unquote

BASE = os.path.dirname(os.path.abspath(__file__))
STATIC = os.path.join(BASE, "static")
DATA = os.path.join(BASE, "data")
DB_PATH = os.path.join(DATA, "desk.db")
DICT_PATH = os.path.join(DATA, "dictation.json")
PORT = int(os.environ.get("DESK_PORT", "8777"))

os.makedirs(DATA, exist_ok=True)

# ---------------------------------------------------------------- 数据库

SCHEMA = """
CREATE TABLE IF NOT EXISTS attempts (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  ts       TEXT NOT NULL,
  day      TEXT NOT NULL,
  subject  TEXT NOT NULL,
  kind     TEXT NOT NULL,
  ref      TEXT NOT NULL,
  question TEXT NOT NULL,
  answer   TEXT NOT NULL,
  given    TEXT NOT NULL,
  ok       INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_attempts_day ON attempts(day);

CREATE TABLE IF NOT EXISTS wrong_items (
  ref      TEXT PRIMARY KEY,
  subject  TEXT NOT NULL,
  kind     TEXT NOT NULL,
  payload  TEXT NOT NULL,
  stage    INTEGER NOT NULL DEFAULT 0,
  due      TEXT NOT NULL,
  wrong    INTEGER NOT NULL DEFAULT 1,
  fixed    INTEGER NOT NULL DEFAULT 0,
  last_ts  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_wrong_due ON wrong_items(due, fixed);
"""

# 复习间隔（天）：答对推进一档，走完即视为掌握
STAGES = [1, 3, 7, 15, 30]


def now():
    return datetime.datetime.now()


def today():
    return now().strftime("%Y-%m-%d")


def db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.executescript(SCHEMA)  # 幂等：库文件被删也能自愈
    return conn


def init_db():
    conn = db()
    conn.executescript(SCHEMA)
    conn.commit()
    conn.close()


# ---------------------------------------------------------------- 口算出题

def _r(a, b):
    return random.randint(a, b)


def gen_add_sub(level):
    if level == 1:
        if random.random() < 0.5:
            a = _r(1, 9)
            b = _r(1, max(1, 10 - a))
            return "%d + %d =" % (a, b), a + b
        a = _r(2, 10)
        b = _r(1, a - 1)
        return "%d − %d =" % (a, b), a - b
    if level == 2:
        if random.random() < 0.5:
            a = _r(11, 88)
            b = _r(2, 99 - a)
            return "%d + %d =" % (a, b), a + b
        a = _r(21, 99)
        b = _r(2, a - 1)
        return "%d − %d =" % (a, b), a - b
    mode = random.random()
    if mode < 0.4:
        a, b, c = _r(11, 60), _r(2, 30), _r(2, 20)
        return "%d + %d − %d =" % (a, b, c), a + b - c
    if mode < 0.7:
        b, c = _r(2, 20), _r(2, 15)
        a = _r(b + c + 1, 90)
        return "%d − %d − %d =" % (a, b, c), a - b - c
    a, b = _r(20, 70), _r(5, 29)
    return "%d + %d =" % (a, b), a + b


def gen_mul(level):
    hi = 5 if level == 1 else 9
    a, b = _r(2, hi), _r(2, 9)
    return "%d × %d =" % (a, b), a * b


def gen_div(level):
    hi = 5 if level == 1 else 9
    b, q = _r(2, hi), _r(2, 9)
    return "%d ÷ %d =" % (b * q, b), q


def gen_mul_add(level):
    a, b = _r(2, 9), _r(2, 9)
    if random.random() < 0.5:
        c = _r(1, 20)
        return "%d × %d + %d =" % (a, b, c), a * b + c
    p = a * b
    c = _r(1, p - 1)
    return "%d × %d − %d =" % (a, b, c), p - c


def gen_money(level):
    if random.random() < 0.55:
        y, j = _r(1, 9), _r(1, 9)
        return "%d 元 %d 角 = ( ) 角" % (y, j), y * 10 + j
    y = _r(1, 9)
    return "%d 元 = ( ) 角" % (y,), y * 10


GENS = {
    "add_sub": gen_add_sub,
    "mul": gen_mul,
    "div": gen_div,
    "mul_add": gen_mul_add,
    "money": gen_money,
}

PLAN = {
    1: ["add_sub", "add_sub", "mul", "money"],
    2: ["add_sub", "add_sub", "mul", "div", "money"],
    3: ["add_sub", "mul", "div", "mul_add", "money"],
}


def build_math(count, level):
    level = max(1, min(3, int(level)))
    pool = PLAN[level]
    out, seen = [], set()
    guard = 0
    while len(out) < count and guard < count * 40:
        guard += 1
        kind = random.choice(pool)
        q, a = GENS[kind](level)
        if q in seen:
            continue
        seen.add(q)
        out.append({"kind": kind, "question": q, "answer": a, "level": level})
    return out


# ---------------------------------------------------------------- 听写

def load_dict():
    if not os.path.exists(DICT_PATH):
        return {"units": []}
    with open(DICT_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


# ---------------------------------------------------------------- 业务逻辑

def api_quiz_math(count, level):
    return {"items": build_math(count, level)}


def api_quiz_dictation(unit, count):
    data = load_dict()
    units = data.get("units", [])
    if unit and unit != "all":
        units = [u for u in units if u.get("id") == unit]
    words = []
    for u in units:
        for w in u.get("words", []):
            words.append({"word": w, "unit": u.get("id"), "unit_name": u.get("name")})
    random.shuffle(words)
    return {"items": words[:count]}


def api_dict_units():
    data = load_dict()
    out = []
    for u in data.get("units", []):
        out.append({"id": u.get("id"), "name": u.get("name"), "count": len(u.get("words", []))})
    return {"units": out, "note": data.get("note", "")}


def api_submit(payload):
    subject = payload.get("subject", "math")
    items = payload.get("items", [])
    ts = now().strftime("%Y-%m-%d %H:%M:%S")
    day = today()
    conn = db()
    cur = conn.cursor()
    fixed_now = []
    for it in items:
        ref = str(it.get("ref") or it.get("question") or "")[:200]
        kind = str(it.get("kind") or "")
        question = str(it.get("question") or "")
        answer = str(it.get("answer") or "")
        given = str(it.get("given") or "")
        ok = 1 if it.get("ok") else 0

        cur.execute(
            "INSERT INTO attempts(ts, day, subject, kind, ref, question, answer, given, ok)"
            " VALUES (?,?,?,?,?,?,?,?,?)",
            (ts, day, subject, kind, ref, question, answer, given, ok),
        )

        row = cur.execute("SELECT * FROM wrong_items WHERE ref = ?", (ref,)).fetchone()
        if not ok:
            if row is None:
                payload_json = json.dumps(
                    {"question": question, "answer": answer, "subject": subject}, ensure_ascii=False
                )
                due = (now() + datetime.timedelta(days=STAGES[0])).strftime("%Y-%m-%d")
                cur.execute(
                    "INSERT INTO wrong_items(ref, subject, kind, payload, stage, due, wrong, fixed, last_ts)"
                    " VALUES (?,?,?,?,?,?,?,?,?)",
                    (ref, subject, kind, payload_json, 0, due, 1, 0, ts),
                )
            else:
                stage = row["stage"]
                due = (now() + datetime.timedelta(days=STAGES[min(stage, len(STAGES) - 1)])).strftime("%Y-%m-%d")
                cur.execute(
                    "UPDATE wrong_items SET wrong = wrong + 1, stage = 0, due = ?, fixed = 0, last_ts = ?"
                    " WHERE ref = ?",
                    (due, ts, ref),
                )
        else:
            if row is not None and not row["fixed"]:
                stage = row["stage"] + 1
                if stage >= len(STAGES):
                    cur.execute(
                        "UPDATE wrong_items SET fixed = 1, stage = ?, last_ts = ? WHERE ref = ?",
                        (stage, ts, ref),
                    )
                    fixed_now.append(ref)
                else:
                    due = (now() + datetime.timedelta(days=STAGES[stage])).strftime("%Y-%m-%d")
                    cur.execute(
                        "UPDATE wrong_items SET stage = ?, due = ?, last_ts = ? WHERE ref = ?",
                        (stage, due, ts, ref),
                    )
    conn.commit()
    conn.close()
    return {"ok": True, "saved": len(items), "fixed": fixed_now}


def api_review():
    """今日待复习：错题 + 到期项，最多 20 条。"""
    day = today()
    conn = db()
    rows = conn.execute(
        "SELECT * FROM wrong_items WHERE fixed = 0 AND due <= ? ORDER BY wrong DESC, due ASC LIMIT 20",
        (day,),
    ).fetchall()
    conn.close()
    items = []
    for r in rows:
        p = json.loads(r["payload"])
        items.append(
            {
                "ref": r["ref"],
                "subject": r["subject"],
                "kind": r["kind"],
                "question": p.get("question", ""),
                "answer": p.get("answer", ""),
                "stage": r["stage"],
                "wrong": r["wrong"],
                "due": r["due"],
            }
        )
    return {"items": items, "date": day}


def api_stats(days=7):
    conn = db()
    day = today()
    d0 = (now() - datetime.timedelta(days=days - 1)).strftime("%Y-%m-%d")

    today_rows = conn.execute(
        "SELECT subject, COUNT(*) n, SUM(ok) ok FROM attempts WHERE day = ? GROUP BY subject", (day,)
    ).fetchall()

    series = conn.execute(
        "SELECT day, COUNT(*) n, SUM(ok) ok FROM attempts WHERE day >= ? GROUP BY day ORDER BY day", (d0,)
    ).fetchall()

    wrong = conn.execute(
        "SELECT ref, subject, kind, payload, stage, wrong, due FROM wrong_items"
        " WHERE fixed = 0 ORDER BY wrong DESC, due ASC LIMIT 40"
    ).fetchall()

    kinds = conn.execute(
        "SELECT kind, COUNT(*) n, SUM(ok) ok FROM attempts WHERE day >= ? GROUP BY kind ORDER BY n DESC", (d0,)
    ).fetchall()

    # 连续打卡天数
    streak = 0
    probe = now()
    for _ in range(400):
        d = probe.strftime("%Y-%m-%d")
        n = conn.execute("SELECT COUNT(*) c FROM attempts WHERE day = ?", (d,)).fetchone()["c"]
        if n > 0:
            streak += 1
            probe -= datetime.timedelta(days=1)
        else:
            if streak == 0 and d == day:
                probe -= datetime.timedelta(days=1)
                continue
            break
    conn.close()

    def pack(rows):
        return [
            {
                "day": r["day"],
                "n": r["n"],
                "ok": r["ok"] or 0,
            }
            for r in rows
        ]

    return {
        "today": [{"subject": r["subject"], "n": r["n"], "ok": r["ok"] or 0} for r in today_rows],
        "series": pack(series),
        "wrong": [
            {
                "ref": r["ref"],
                "subject": r["subject"],
                "kind": r["kind"],
                "question": json.loads(r["payload"]).get("question", ""),
                "answer": json.loads(r["payload"]).get("answer", ""),
                "stage": r["stage"],
                "wrong": r["wrong"],
                "due": r["due"],
            }
            for r in wrong
        ],
        "kinds": [{"kind": r["kind"], "n": r["n"], "ok": r["ok"] or 0} for r in kinds],
        "streak": streak,
    }


# ---------------------------------------------------------------- HTTP

class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=STATIC, **kw)

    def log_message(self, fmt, *args):
        pass  # 静默

    def _json(self, obj, code=200):
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        u = urlparse(self.path)
        if not u.path.startswith("/api/"):
            return super().do_GET()
        qs = parse_qs(u.query)

        def q(k, d=""):
            return qs.get(k, [d])[0]

        try:
            if u.path == "/api/quiz/math":
                return self._json(api_quiz_math(int(q("count", "20")), int(q("level", "2"))))
            if u.path == "/api/quiz/dictation":
                return self._json(api_quiz_dictation(q("unit", "all"), int(q("count", "10"))))
            if u.path == "/api/dict/units":
                return self._json(api_dict_units())
            if u.path == "/api/review":
                return self._json(api_review())
            if u.path == "/api/stats":
                return self._json(api_stats(int(q("days", "7"))))
            if u.path == "/api/ping":
                return self._json({"ok": True, "ts": now().isoformat()})
        except Exception as e:  # noqa
            return self._json({"error": str(e)}, 500)
        return self._json({"error": "not found"}, 404)

    def do_POST(self):
        u = urlparse(self.path)
        try:
            n = int(self.headers.get("Content-Length", "0"))
            payload = json.loads(self.rfile.read(n).decode("utf-8") or "{}")
        except Exception:
            payload = {}
        if u.path == "/api/submit":
            try:
                return self._json(api_submit(payload))
            except Exception as e:  # noqa
                return self._json({"error": str(e)}, 500)
        return self._json({"error": "not found"}, 404)


def lan_ip():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("223.5.5.5", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "127.0.0.1"


def main():
    init_db()
    ip = lan_ip()
    print("")
    print("  小满学习台 已启动")
    print("  ─────────────────────────────")
    print("  本机：   http://127.0.0.1:%d" % PORT)
    print("  平板：   http://%s:%d" % (ip, PORT))
    print("  ─────────────────────────────")
    print("  Ctrl+C 停止")
    print("")
    srv = ThreadingHTTPServer(("0.0.0.0", PORT), Handler)
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        print("\n已停止")


if __name__ == "__main__":
    main()
