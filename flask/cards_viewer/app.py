import copy
import json
import os
from pathlib import Path

from flask import Flask, jsonify, make_response, render_template
from flask_cors import CORS


BASE_DIR = Path(__file__).resolve().parent
DEFAULT_DATA_PATH = BASE_DIR.parents[1] / "public" / "data" / "card_analysis_data.json"
DATA_PATH = Path(os.getenv("CARD_DATA_PATH", str(DEFAULT_DATA_PATH))).resolve()
PARENT_ORIGIN = os.getenv("PARENT_ORIGIN", "http://localhost:3000")

allowed_origins = [o.strip() for o in os.getenv("ALLOWED_ORIGINS", "http://localhost:3000").split(",") if o.strip()]

app = Flask(__name__)
CORS(app, resources={r"/api/*": {"origins": allowed_origins}})


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
    if blank_cards:
        merged_blanks = []
        for card in blank_cards:
            merged_blanks.append(
                {
                    "row": card.get("row"),
                    "col": card.get("col"),
                    "value": card.get("value", "BLANK"),
                    "suit_symbol": card.get("suit_symbol", "\u25fb"),
                    "color": card.get("color", "#9e9e9e"),
                    "is_blank": True,
                }
            )
        moves.extend(merged_blanks)

    out["moves"] = moves
    out["move_count"] = len(moves)
    out["has_blank_cards"] = len(blank_cards) > 0
    out["blank_card_count"] = len(blank_cards)
    return out


def _enhance_data(data):
    out = copy.deepcopy(data)
    analysis_types = out.get("analysis_types") or []
    for analysis in analysis_types:
        trials = analysis.get("trials") or []
        analysis["trials"] = [_merge_trial_blanks(trial) for trial in trials]
    return out


def _json_response(payload, no_store=True):
    response = make_response(jsonify(payload))
    if no_store:
        response.headers["Cache-Control"] = "no-store"
    else:
        response.headers["Cache-Control"] = "public, max-age=60"
    response.headers["Content-Type"] = "application/json; charset=utf-8"
    return response


@app.route("/")
def index():
    return render_template("index.html", parent_origin=PARENT_ORIGIN)


@app.route("/api/data")
def api_data():
    raw = _read_json()
    return _json_response(_enhance_data(raw), no_store=True)


@app.route("/api/statistics")
def api_statistics():
    raw = _read_json()
    return _json_response(raw.get("statistics", {}), no_store=True)


@app.route("/api/analysis/<int:analysis_id>")
def api_analysis(analysis_id):
    raw = _read_json()
    for analysis in raw.get("analysis_types", []):
        if analysis.get("id") == analysis_id:
            payload = copy.deepcopy(analysis)
            payload["trials"] = [_merge_trial_blanks(trial) for trial in payload.get("trials", [])]
            return _json_response(payload, no_store=True)
    return _json_response({"error": "Analysis not found"}, no_store=True), 404


@app.route("/health")
def health():
    return _json_response({"status": "ok", "data_path": str(DATA_PATH)}, no_store=False)


if __name__ == "__main__":
    port = int(os.getenv("PORT", "5000"))
    app.run(host="0.0.0.0", port=port, debug=True)
