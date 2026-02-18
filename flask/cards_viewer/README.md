# Flask Cards Viewer (Vanilla JS)

Standalone Flask + vanilla JavaScript implementation of the cards analysis viewer.

## Features
- Merges blank cards from `final_state` directly into animation timeline.
- Exposes REST API endpoints for data and statistics.
- Supports embed mode with auto-height postMessage.
- Theme aligned to portfolio colors.
- New `/play` playground with instant analysis and history.
- Optional GIF export for replay sessions.

## Local Run
1. Create and activate a virtual environment.
2. Install requirements:
   - `pip install -r requirements.txt`
3. Start server:
   - `python app.py`
4. Open:
   - `http://localhost:5000`

## Environment Variables
- `PORT`: Flask port (default `5000`)
- `CARD_DATA_PATH`: JSON file path (default `../../public/data/card_analysis_data.json`)
- `ALLOWED_ORIGINS`: comma-separated CORS allowlist for `/api/*`
- `PARENT_ORIGIN`: trusted parent origin for iframe `postMessage` target
- `ENABLE_PLAYGROUND`: enable/disable `/play` and `/api/play/*` endpoints
- `ENABLE_GIF_EXPORT`: enable/disable GIF export endpoint
- `ENABLE_HISTORY_TAB`: enable/disable history tab in play UI
- `PLAY_DB_PATH`: SQLite DB path for visitor/session/move storage

## API
- `GET /api/data`
- `GET /api/statistics`
- `GET /api/analysis/<id>`
- `GET /health`
- `POST /api/play/session/start`
- `POST /api/play/session/<session_id>/move`
- `POST /api/play/session/<session_id>/complete`
- `GET /api/play/session/<session_id>/result`
- `GET /api/play/history`
- `POST /api/play/export/gif`

## Deployment (Gunicorn)
- `gunicorn app:app --bind 0.0.0.0:$PORT`

## Next.js Embed Integration
- Set `NEXT_PUBLIC_CARDS_EMBED_URL` to deployed Flask URL.
- Set `NEXT_PUBLIC_CARDS_EMBED_ORIGIN` to Flask origin (or comma-separated allowlist).
- Next.js project page iframe with `data-cards-embed='1'` will auto-switch to Flask URL.
