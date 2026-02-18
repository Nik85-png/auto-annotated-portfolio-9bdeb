import copy
import io
import json
import os
import sqlite3
import uuid
from datetime import datetime, timezone
from pathlib import Path
from statistics import mean

from flask import Flask, jsonify, make_response, render_template, request, send_file
from flask_cors import CORS
from PIL import Image, ImageDraw, ImageFont


BASE_DIR = Path(__file__).resolve().parent
DEFAULT_DATA_PATH = BASE_DIR.parents[1] / "public" / "data" / "card_analysis_data.json"
DATA_PATH = Path(os.getenv("CARD_DATA_PATH", str(DEFAULT_DATA_PATH))).resolve()
DB_PATH = Path(os.getenv("PLAY_DB_PATH", str(BASE_DIR / "play_sessions.db"))).resolve()
PARENT_ORIGIN = os.getenv("PARENT_ORIGIN", "http://localhost:3000")

allowed_origins = [o.strip() for o in os.getenv("ALLOWED_ORIGINS", "http://localhost:3000").split(",") if o.strip()]


def env_flag(name: str, default: bool) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


ENABLE_PLAYGROUND = env_flag("ENABLE_PLAYGROUND", False)
ENABLE_GIF_EXPORT = env_flag("ENABLE_GIF_EXPORT", True)
ENABLE_HISTORY_TAB = env_flag("ENABLE_HISTORY_TAB", True)

app = Flask(__name__)
CORS(app, resources={r"/api/*": {"origins": allowed_origins}})


def utc_now_iso():
    return datetime.now(timezone.utc).isoformat()


def db_conn():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def ensure_db():
    conn = db_conn()
    cur = conn.cursor()
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS visitors (
            visitor_id TEXT PRIMARY KEY,
            display_name TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            last_seen_at TEXT NOT NULL
        )
        """
    )
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS play_sessions (
            session_id TEXT PRIMARY KEY,
            visitor_id TEXT NOT NULL,
            condition TEXT NOT NULL,
            status TEXT NOT NULL,
            started_at TEXT NOT NULL,
            completed_at TEXT,
            result_json TEXT,
            user_agent TEXT,
            device_type TEXT
        )
        """
    )
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS moves (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id TEXT NOT NULL,
            move_index INTEGER NOT NULL,
            row INTEGER NOT NULL,
            col INTEGER NOT NULL,
            value TEXT,
            suit_symbol TEXT,
            color TEXT,
            is_blank INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL
        )
        """
    )
    conn.commit()
    conn.close()


def _read_json():
    if not DATA_PATH.exists():
        return {"statistics": {}, "analysis_types": []}
    with DATA_PATH.open("r", encoding="utf-8-sig") as f:
        return json.load(f)


def _is_blank(card):
    if not isinstance(card, dict):
        return False
    if card.get("is_blank") is True:
        return True
    return str(card.get("value", "")).upper() == "BLANK"


def _merge_trial_blanks(trial):
    out = copy.deepcopy(trial)
    moves = list(out.get("moves") or [])
    final_state = list(out.get("final_state") or [])
    blank_cards = [card for card in final_state if _is_blank(card)]
    for card in blank_cards:
        moves.append(
            {
                "row": card.get("row"),
                "col": card.get("col"),
                "value": card.get("value", "BLANK"),
                "suit_symbol": card.get("suit_symbol", "\u25fb"),
                "color": card.get("color", "#9e9e9e"),
                "is_blank": True,
            }
        )
    out["moves"] = moves
    out["move_count"] = len(moves)
    out["has_blank_cards"] = len(blank_cards) > 0
    out["blank_card_count"] = len(blank_cards)
    return out


def _enhance_data(data):
    out = copy.deepcopy(data)
    for analysis in out.get("analysis_types", []):
        analysis["trials"] = [_merge_trial_blanks(t) for t in analysis.get("trials", [])]
    return out


def _json_response(payload, no_store=True):
    response = make_response(jsonify(payload))
    response.headers["Cache-Control"] = "no-store" if no_store else "public, max-age=60"
    response.headers["Content-Type"] = "application/json; charset=utf-8"
    return response


def _all_trials_for_condition(condition: str):
    data = _read_json()
    trials = []
    for analysis in data.get("analysis_types", []):
        for t in analysis.get("trials", []):
            if t.get("condition") == condition:
                trials.append(_merge_trial_blanks(t))
    return trials


def _messiness_from_moves(moves):
    points = [(m.get("row"), m.get("col")) for m in moves if isinstance(m.get("row"), int) and isinstance(m.get("col"), int)]
    if not points:
        return 0.0
    x_bar = mean([p[0] for p in points])
    y_bar = mean([p[1] for p in points])
    dists = [((x - x_bar) ** 2 + (y - y_bar) ** 2) ** 0.5 for x, y in points]
    return sum(dists) / len(dists)


def _deterioration_slope(moves):
    if len(moves) < 3:
        return 0.0
    running = []
    for i in range(1, len(moves) + 1):
        running.append(_messiness_from_moves(moves[:i]))
    xs = list(range(1, len(running) + 1))
    x_mean = mean(xs)
    y_mean = mean(running)
    num = sum((x - x_mean) * (y - y_mean) for x, y in zip(xs, running))
    den = sum((x - x_mean) ** 2 for x in xs)
    return (num / den) if den else 0.0


def _percentile(value, population, reverse=False):
    if not population:
        return 50.0
    arr = sorted(population, reverse=reverse)
    lower_or_equal = sum(1 for v in arr if v <= value) if not reverse else sum(1 for v in arr if v >= value)
    return round((lower_or_equal / len(arr)) * 100.0, 1)


def _insight_label(move_count, messiness, slope, blank_count):
    if blank_count > 0 and messiness < 2.4:
        return "Blank-Strategic Solver"
    if slope <= 0.12 and messiness < 2.2:
        return "Structured Explorer"
    if move_count < 8 and messiness > 3.0:
        return "Fast but Chaotic"
    return "Persistent Organizer"


def _device_type(ua: str):
    ua_l = (ua or "").lower()
    return "mobile" if any(k in ua_l for k in ["android", "iphone", "mobile"]) else "desktop"


def _require_playground():
    if not ENABLE_PLAYGROUND:
        return _json_response({"error": "Playground disabled"}, no_store=True), 404
    return None


@app.route("/")
def index():
    return render_template("index.html", parent_origin=PARENT_ORIGIN)


@app.route("/play")
def play():
    if not ENABLE_PLAYGROUND:
        return render_template("play_disabled.html"), 404
    return render_template(
        "play.html",
        parent_origin=PARENT_ORIGIN,
        enable_history=ENABLE_HISTORY_TAB,
        enable_gif=ENABLE_GIF_EXPORT,
    )


@app.route("/api/data")
def api_data():
    return _json_response(_enhance_data(_read_json()), no_store=True)


@app.route("/api/statistics")
def api_statistics():
    return _json_response(_read_json().get("statistics", {}), no_store=True)


@app.route("/api/analysis/<int:analysis_id>")
def api_analysis(analysis_id):
    raw = _read_json()
    for analysis in raw.get("analysis_types", []):
        if analysis.get("id") == analysis_id:
            payload = copy.deepcopy(analysis)
            payload["trials"] = [_merge_trial_blanks(t) for t in payload.get("trials", [])]
            return _json_response(payload, no_store=True)
    return _json_response({"error": "Analysis not found"}, no_store=True), 404


@app.route("/api/play/session/start", methods=["POST"])
def api_play_start():
    blocked = _require_playground()
    if blocked:
        return blocked

    body = request.get_json(silent=True) or {}
    condition = body.get("condition", "KQJB")
    display_name = (body.get("display_name") or "").strip()[:80] or None
    visitor_id = (body.get("visitor_id") or request.cookies.get("cards_visitor_token") or str(uuid.uuid4())).strip()
    session_id = str(uuid.uuid4())
    now = utc_now_iso()
    ua = request.headers.get("User-Agent", "")

    conn = db_conn()
    cur = conn.cursor()
    cur.execute("SELECT visitor_id FROM visitors WHERE visitor_id = ?", (visitor_id,))
    exists = cur.fetchone()
    if exists:
        cur.execute(
            "UPDATE visitors SET display_name = COALESCE(?, display_name), updated_at = ?, last_seen_at = ? WHERE visitor_id = ?",
            (display_name, now, now, visitor_id),
        )
    else:
        cur.execute(
            "INSERT INTO visitors(visitor_id, display_name, created_at, updated_at, last_seen_at) VALUES(?,?,?,?,?)",
            (visitor_id, display_name, now, now, now),
        )

    cur.execute(
        """
        INSERT INTO play_sessions(session_id, visitor_id, condition, status, started_at, user_agent, device_type)
        VALUES(?,?,?,?,?,?,?)
        """,
        (session_id, visitor_id, condition, "in_progress", now, ua, _device_type(ua)),
    )
    conn.commit()
    conn.close()

    payload = {
        "session_id": session_id,
        "visitor_id": visitor_id,
        "condition": condition,
        "started_at": now,
    }
    response = _json_response(payload, no_store=True)
    response.set_cookie("cards_visitor_token", visitor_id, max_age=60 * 60 * 24 * 365, httponly=False, samesite="Lax")
    return response


@app.route("/api/play/session/<session_id>/move", methods=["POST"])
def api_play_move(session_id):
    blocked = _require_playground()
    if blocked:
        return blocked

    body = request.get_json(silent=True) or {}
    try:
        move_index = int(body.get("move_index"))
        row = int(body.get("row"))
        col = int(body.get("col"))
    except (TypeError, ValueError):
        return _json_response({"error": "Invalid move fields"}, no_store=True), 400

    if not (0 <= row <= 7 and 0 <= col <= 7 and move_index >= 0):
        return _json_response({"error": "Move out of bounds"}, no_store=True), 400

    value = body.get("value")
    suit_symbol = body.get("suit_symbol")
    color = body.get("color")
    is_blank = 1 if _is_blank(body) else 0
    now = utc_now_iso()

    conn = db_conn()
    cur = conn.cursor()
    cur.execute("SELECT status FROM play_sessions WHERE session_id = ?", (session_id,))
    row_status = cur.fetchone()
    if not row_status:
        conn.close()
        return _json_response({"error": "Session not found"}, no_store=True), 404
    if row_status["status"] == "completed":
        conn.close()
        return _json_response({"error": "Session already completed"}, no_store=True), 409

    cur.execute(
        """
        INSERT INTO moves(session_id, move_index, row, col, value, suit_symbol, color, is_blank, created_at)
        VALUES(?,?,?,?,?,?,?,?,?)
        """,
        (session_id, move_index, row, col, value, suit_symbol, color, is_blank, now),
    )
    conn.commit()
    conn.close()
    return _json_response({"ok": True}, no_store=True)


@app.route("/api/play/session/<session_id>/complete", methods=["POST"])
def api_play_complete(session_id):
    blocked = _require_playground()
    if blocked:
        return blocked

    conn = db_conn()
    cur = conn.cursor()
    cur.execute("SELECT * FROM play_sessions WHERE session_id = ?", (session_id,))
    session = cur.fetchone()
    if not session:
        conn.close()
        return _json_response({"error": "Session not found"}, no_store=True), 404

    if session["status"] == "completed":
        result = json.loads(session["result_json"] or "{}")
        conn.close()
        return _json_response({"session_id": session_id, "result": result}, no_store=True)

    cur.execute("SELECT * FROM moves WHERE session_id = ? ORDER BY move_index ASC", (session_id,))
    rows = cur.fetchall()
    moves = [
        {
            "move_index": r["move_index"],
            "row": r["row"],
            "col": r["col"],
            "value": r["value"],
            "suit_symbol": r["suit_symbol"],
            "color": r["color"],
            "is_blank": bool(r["is_blank"]),
        }
        for r in rows
    ]

    condition = session["condition"]
    baseline_trials = _all_trials_for_condition(condition)
    baseline_moves = [len((t.get("moves") or [])) for t in baseline_trials] or [1]
    baseline_messiness = [float(t.get("messiness_score") or _messiness_from_moves(t.get("moves") or [])) for t in baseline_trials] or [0.0]
    baseline_blank = [int(t.get("blank_card_count", 1 if t.get("has_blank_cards") else 0)) for t in baseline_trials] or [0]

    move_count = len(moves)
    messiness = _messiness_from_moves(moves)
    slope = _deterioration_slope(moves)
    blank_count = sum(1 for m in moves if _is_blank(m))
    efficiency = 1.0 / max(move_count, 1)
    baseline_efficiency = [1.0 / max(v, 1) for v in baseline_moves]

    result = {
        "move_count": move_count,
        "messiness_score": round(messiness, 4),
        "organization_deterioration_rate": round(slope, 4),
        "blank_cards_used": blank_count,
        "condition": condition,
        "condition_matched_percentile": {
            "messiness": _percentile(messiness, baseline_messiness, reverse=True),
            "efficiency": _percentile(efficiency, baseline_efficiency, reverse=False),
            "blank_usage": _percentile(blank_count, baseline_blank, reverse=False),
        },
        "insight_label": _insight_label(move_count, messiness, slope, blank_count),
    }

    now = utc_now_iso()
    cur.execute(
        "UPDATE play_sessions SET status = ?, completed_at = ?, result_json = ? WHERE session_id = ?",
        ("completed", now, json.dumps(result), session_id),
    )
    conn.commit()
    conn.close()

    return _json_response({"session_id": session_id, "result": result}, no_store=True)


@app.route("/api/play/session/<session_id>/result")
def api_play_result(session_id):
    blocked = _require_playground()
    if blocked:
        return blocked

    conn = db_conn()
    cur = conn.cursor()
    cur.execute("SELECT result_json, status FROM play_sessions WHERE session_id = ?", (session_id,))
    row = cur.fetchone()
    conn.close()
    if not row:
        return _json_response({"error": "Session not found"}, no_store=True), 404
    if row["status"] != "completed":
        return _json_response({"error": "Session not completed"}, no_store=True), 409
    return _json_response({"session_id": session_id, "result": json.loads(row["result_json"] or "{}")}, no_store=True)


@app.route("/api/play/history")
def api_play_history():
    blocked = _require_playground()
    if blocked:
        return blocked
    if not ENABLE_HISTORY_TAB:
        return _json_response({"sessions": []}, no_store=True)

    visitor_id = (request.args.get("visitor_id") or request.cookies.get("cards_visitor_token") or "").strip()
    if not visitor_id:
        return _json_response({"sessions": []}, no_store=True)

    conn = db_conn()
    cur = conn.cursor()
    cur.execute(
        """
        SELECT s.session_id, s.condition, s.status, s.started_at, s.completed_at, s.result_json, v.display_name
        FROM play_sessions s
        LEFT JOIN visitors v ON v.visitor_id = s.visitor_id
        WHERE s.visitor_id = ?
        ORDER BY s.started_at DESC
        LIMIT 100
        """,
        (visitor_id,),
    )
    rows = cur.fetchall()
    conn.close()
    sessions = []
    for r in rows:
        sessions.append(
            {
                "session_id": r["session_id"],
                "condition": r["condition"],
                "status": r["status"],
                "started_at": r["started_at"],
                "completed_at": r["completed_at"],
                "display_name": r["display_name"],
                "result": json.loads(r["result_json"] or "{}") if r["result_json"] else None,
            }
        )
    return _json_response({"sessions": sessions}, no_store=True)


def _build_board_states(moves):
    states = []
    board = {}
    for i, m in enumerate(moves):
        key = (m.get("row"), m.get("col"))
        board[key] = m
        states.append((i, dict(board)))
    return states


def _draw_frame(state, current_idx):
    size = 420
    padding = 20
    cell = 44
    header = 20
    img = Image.new("RGB", (size, size), color=(13, 27, 42))
    draw = ImageDraw.Draw(img)
    font = ImageFont.load_default()

    for i in range(8):
        x = padding + header + i * cell
        y = padding
        draw.rectangle([x, y, x + cell - 2, y + header - 2], fill=(20, 108, 148))
        draw.text((x + 14, y + 5), str(i), fill="white", font=font)
        x2 = padding
        y2 = padding + header + i * cell
        draw.rectangle([x2, y2, x2 + header - 2, y2 + cell - 2], fill=(20, 108, 148))
        draw.text((x2 + 5, y2 + 14), str(i), fill="white", font=font)

    for r in range(8):
        for c in range(8):
            x = padding + header + c * cell
            y = padding + header + r * cell
            card = state.get((r, c))
            if card:
                blank = _is_blank(card)
                fill = (158, 158, 158) if blank else (255, 255, 255)
                draw.rectangle([x, y, x + cell - 2, y + cell - 2], fill=fill, outline=(180, 180, 180))
                txt = "\u25a1" if blank else f"{card.get('value','')}{card.get('suit_symbol','')}"
                clr = (255, 255, 255) if blank else ((220, 38, 38) if card.get("color") == "red" else (17, 24, 39))
                draw.text((x + 7, y + 14), txt, fill=clr, font=font)
                if card.get("move_index") == current_idx:
                    draw.rectangle([x, y, x + cell - 2, y + cell - 2], outline=(244, 162, 97), width=3)
            else:
                draw.rectangle([x, y, x + cell - 2, y + cell - 2], fill=(28, 76, 60), outline=(60, 120, 95))

    return img


@app.route("/api/play/export/gif", methods=["POST"])
def api_export_gif():
    blocked = _require_playground()
    if blocked:
        return blocked
    if not ENABLE_GIF_EXPORT:
        return _json_response({"error": "GIF export disabled"}, no_store=True), 404

    body = request.get_json(silent=True) or {}
    session_id = body.get("session_id")
    if not session_id:
        return _json_response({"error": "session_id required"}, no_store=True), 400

    conn = db_conn()
    cur = conn.cursor()
    cur.execute("SELECT row, col, value, suit_symbol, color, is_blank, move_index FROM moves WHERE session_id = ? ORDER BY move_index ASC", (session_id,))
    rows = cur.fetchall()
    conn.close()
    if not rows:
        return _json_response({"error": "No moves found"}, no_store=True), 404

    moves = [
        {
            "row": int(r["row"]),
            "col": int(r["col"]),
            "value": r["value"],
            "suit_symbol": r["suit_symbol"],
            "color": r["color"],
            "is_blank": bool(r["is_blank"]),
            "move_index": int(r["move_index"]),
        }
        for r in rows
    ][:180]

    frames = []
    for idx, state in _build_board_states(moves):
        frames.append(_draw_frame(state, idx))
    if not frames:
        return _json_response({"error": "No frames generated"}, no_store=True), 500

    output = io.BytesIO()
    frames[0].save(output, format="GIF", save_all=True, append_images=frames[1:], duration=350, loop=0)
    output.seek(0)
    return send_file(output, mimetype="image/gif", as_attachment=True, download_name=f"cards-session-{session_id}.gif")


@app.route("/health")
def health():
    return _json_response(
        {
            "status": "ok",
            "data_path": str(DATA_PATH),
            "db_path": str(DB_PATH),
            "enable_playground": ENABLE_PLAYGROUND,
            "enable_gif_export": ENABLE_GIF_EXPORT,
            "enable_history_tab": ENABLE_HISTORY_TAB,
        },
        no_store=False,
    )


ensure_db()

if __name__ == "__main__":
    port = int(os.getenv("PORT", "5000"))
    app.run(host="0.0.0.0", port=port, debug=True)
