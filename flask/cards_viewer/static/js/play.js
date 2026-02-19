const state = {
    visitorId: localStorage.getItem('cards_visitor_token') || '',
    displayName: localStorage.getItem('cards_display_name') || '',
    condition: 'KQJB',
    sessionId: '',
    started: false,
    moves: [],
    selectedCard: null,
    result: null
};

const CARD_PALETTE = [
    { value: 'K', suit_symbol: '♠', color: 'black', is_blank: false },
    { value: 'K', suit_symbol: '♥', color: 'red', is_blank: false },
    { value: 'Q', suit_symbol: '♣', color: 'black', is_blank: false },
    { value: 'Q', suit_symbol: '♦', color: 'red', is_blank: false },
    { value: 'J', suit_symbol: '♠', color: 'black', is_blank: false },
    { value: 'J', suit_symbol: '♥', color: 'red', is_blank: false },
    { value: 'BLANK', suit_symbol: '□', color: '#9e9e9e', is_blank: true }
];

function $(id) {
    return document.getElementById(id);
}

function setStatus(msg) {
    $('status').textContent = msg;
}

function activateTab(tab) {
    document.querySelectorAll('.tab').forEach((b) => b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach((p) => p.classList.remove('active'));
    document.querySelector(`.tab[data-tab="${tab}"]`)?.classList.add('active');
    document.querySelector(`#tab-${tab}`)?.classList.add('active');
}

function bindTabs() {
    document.querySelectorAll('.tab').forEach((btn) => {
        btn.addEventListener('click', () => activateTab(btn.dataset.tab));
    });
}

function drawPalette() {
    const root = $('palette');
    root.innerHTML = '';
    CARD_PALETTE.forEach((card, idx) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = card.is_blank ? '□' : `${card.value}${card.suit_symbol}`;
        if (state.selectedCard === idx) b.classList.add('active');
        b.onclick = () => {
            state.selectedCard = idx;
            drawPalette();
            setStatus(`Selected ${card.is_blank ? 'BLANK' : `${card.value}${card.suit_symbol}`}`);
        };
        root.appendChild(b);
    });
}

function boardState() {
    const map = {};
    state.moves.forEach((m) => {
        map[`${m.row}-${m.col}`] = m;
    });
    return map;
}

async function submitMove(move) {
    const res = await fetch(`/api/play/session/${state.sessionId}/move`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(move)
    });
    if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload.error || 'Failed to save move');
    }
}

async function ensureSessionStarted() {
    if (state.started && state.sessionId) return true;
    try {
        await startSession();
        return true;
    } catch (err) {
        setStatus(err.message || 'Failed to start session');
        return false;
    }
}

function drawBoard() {
    const root = $('board');
    root.innerHTML = '';
    const frag = document.createDocumentFragment();

    const corner = document.createElement('div');
    corner.className = 'cell head';
    frag.appendChild(corner);

    for (let c = 0; c < 8; c++) {
        const head = document.createElement('div');
        head.className = 'cell head';
        head.textContent = String(c);
        frag.appendChild(head);
    }

    const map = boardState();
    for (let r = 0; r < 8; r++) {
        const rowHead = document.createElement('div');
        rowHead.className = 'cell head';
        rowHead.textContent = String(r);
        frag.appendChild(rowHead);

        for (let c = 0; c < 8; c++) {
            const slot = document.createElement('button');
            slot.type = 'button';
            slot.className = 'cell slot';
            const m = map[`${r}-${c}`];

            if (m) {
                const blank = m.is_blank || String(m.value).toUpperCase() === 'BLANK';
                slot.classList.add('filled');
                if (blank) slot.classList.add('blank');
                slot.textContent = blank ? '□' : `${m.value || ''}${m.suit_symbol || ''}`;
                slot.style.color = blank ? '#fff' : m.color === 'red' ? '#dc2626' : '#111418';
            } else {
                slot.textContent = '+';
            }

            slot.onclick = async () => {
                if (state.selectedCard === null) {
                    setStatus('Select a card first.');
                    return;
                }
                const ready = await ensureSessionStarted();
                if (!ready) return;

                const card = CARD_PALETTE[state.selectedCard];
                const move = {
                    move_index: state.moves.length,
                    row: r,
                    col: c,
                    value: card.value,
                    suit_symbol: card.suit_symbol,
                    color: card.color,
                    is_blank: !!card.is_blank
                };

                try {
                    await submitMove(move);
                    state.moves.push(move);
                    drawBoard();
                    setStatus(`Recorded move #${state.moves.length}`);
                } catch (err) {
                    setStatus(err.message);
                }
            };
            frag.appendChild(slot);
        }
    }
    root.appendChild(frag);
}

async function startSession() {
    state.displayName = $('displayName').value.trim();
    state.condition = $('condition').value;

    const payload = {
        condition: state.condition,
        display_name: state.displayName || null,
        visitor_id: state.visitorId || null
    };

    const res = await fetch('/api/play/session/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to start');

    state.sessionId = data.session_id;
    state.visitorId = data.visitor_id;
    state.started = true;
    state.moves = [];
    state.result = null;

    localStorage.setItem('cards_visitor_token', state.visitorId);
    if (state.displayName) localStorage.setItem('cards_display_name', state.displayName);
    const last = JSON.parse(localStorage.getItem('cards_last_sessions') || '[]');
    localStorage.setItem('cards_last_sessions', JSON.stringify([state.sessionId, ...last.filter((id) => id !== state.sessionId)].slice(0, 20)));

    setStatus(`Session started (${state.sessionId.slice(0, 8)}...)`);
    drawBoard();
    await loadHistory();
}

async function completeSession() {
    if (!state.started || !state.sessionId) {
        setStatus('Start a session first.');
        return;
    }

    const res = await fetch(`/api/play/session/${state.sessionId}/complete`, { method: 'POST' });
    const data = await res.json();
    if (!res.ok) {
        setStatus(data.error || 'Complete failed');
        return;
    }

    state.result = data.result;
    renderResults();
    activateTab('results');
    await loadHistory();
}

function renderResults() {
    const r = state.result;
    if (!r) {
        $('resultsContent').innerHTML = '<p>Complete a trial to see analysis.</p>';
        if ($('participantCompareContent')) {
            $('participantCompareContent').textContent = 'Enter a participant number from this condition.';
        }
        return;
    }

    const outcomeText = r.trial_outcome === 'success' ? 'SUCCESS' : r.trial_outcome === 'fail' ? 'FAILURE' : 'UNKNOWN';
    const outcomeClass = r.trial_outcome === 'success' ? 'outcome-success' : r.trial_outcome === 'fail' ? 'outcome-fail' : '';
    const nearest = Array.isArray(r.nearest_trials) ? r.nearest_trials : [];
    const better = Array.isArray(r.better_trials) ? r.better_trials : [];
    const peerRank = r.peer_rank || { rank: '-', total: '-', percentile: '-' };

    const nearestHtml = nearest.length
        ? nearest
            .map(
                (t) =>
                    `<li>P${t.participant} | ${t.outcome} | ${t.move_count} moves | messiness ${t.messiness_score} | score ${t.performance_score}</li>`
            )
            .join('')
        : '<li>No nearby baseline trials found.</li>';

    const betterHtml = better.length
        ? better
            .slice(0, 8)
            .map(
                (t) =>
                    `<li>P${t.participant} | ${t.outcome} | ${t.move_count} moves | messiness ${t.messiness_score} | score ${t.performance_score}</li>`
            )
            .join('')
        : '<li>No better baseline trials for this condition.</li>';

    $('resultsContent').innerHTML = `
        <p><strong>Trial Outcome:</strong> <span class="${outcomeClass}">${outcomeText}</span> (${Math.round((r.success_probability || 0) * 100)}% success likelihood, confidence ${Math.round((r.outcome_confidence || 0) * 100)}%)</p>
        <p><strong>Condition:</strong> ${r.condition}</p>
        <p><strong>Move Count:</strong> ${r.move_count}</p>
        <p><strong>Messiness Score:</strong> ${r.messiness_score}</p>
        <p><strong>Deterioration Rate:</strong> ${r.organization_deterioration_rate}</p>
        <p><strong>Blank Cards Used:</strong> ${r.blank_cards_used}</p>
        <p><strong>Performance Score:</strong> ${r.performance_score}</p>
        <p><strong>Insight:</strong> ${r.insight_label}</p>
        <p><strong>Peer Rank (condition-matched):</strong> #${peerRank.rank} / ${peerRank.total} (${peerRank.percentile}th percentile)</p>
        <p><strong>Percentiles (condition-matched):</strong></p>
        <p>Messiness: ${r.condition_matched_percentile.messiness}%</p>
        <p>Efficiency: ${r.condition_matched_percentile.efficiency}%</p>
        <p>Blank Usage: ${r.condition_matched_percentile.blank_usage}%</p>
        <p><strong>Closest Participant Trials:</strong></p>
        <ul>${nearestHtml}</ul>
        <p><strong>Better Trials You Can Study:</strong></p>
        <ul>${betterHtml}</ul>
    `;
}

async function compareParticipant() {
    const output = $('participantCompareContent');
    if (!state.sessionId || !state.result) {
        output.textContent = 'Complete your trial first.';
        return;
    }

    const participantId = ($('participantCompareInput')?.value || '').trim();
    if (!participantId) {
        output.textContent = 'Enter a participant number (example: 189).';
        return;
    }

    const res = await fetch(`/api/play/session/${encodeURIComponent(state.sessionId)}/compare-participant/${encodeURIComponent(participantId)}`, {
        cache: 'no-store'
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
        output.textContent = data.error || 'Could not compare with this participant.';
        return;
    }

    const p = data.participant_summary || {};
    const c = data.comparison || {};
    output.innerHTML = `
        <p><strong>Participant P${p.participant}</strong> (${p.condition})</p>
        <p>Trials: ${p.trial_count} | Success Rate: ${p.success_rate}%</p>
        <p>Avg Moves: ${p.avg_move_count} | Avg Messiness: ${p.avg_messiness_score} | Avg Deterioration: ${p.avg_deterioration_rate}</p>
        <p><strong>Your Delta vs P${p.participant}:</strong></p>
        <p>Moves: ${c.move_count_delta} | Messiness: ${c.messiness_delta} | Deterioration: ${c.deterioration_delta} | Blank Cards: ${c.blank_cards_delta}</p>
    `;
}

async function loadHistory() {
    if (!window.PLAY_CONFIG.enableHistory) return;
    const visitor = localStorage.getItem('cards_visitor_token') || state.visitorId;
    if (!visitor) {
        $('historyContent').innerHTML = '<p>No sessions yet.</p>';
        return;
    }

    const res = await fetch(`/api/play/history?visitor_id=${encodeURIComponent(visitor)}`, { cache: 'no-store' });
    const data = await res.json();
    const sessions = data.sessions || [];

    if (!sessions.length) {
        $('historyContent').innerHTML = '<p>No sessions yet.</p>';
        return;
    }

    $('historyContent').innerHTML = sessions
        .map((s) => {
            const r = s.result || {};
            return `
                <p><strong>${s.condition}</strong> | ${s.status} | ${new Date(s.started_at).toLocaleString()}</p>
                <p class="muted">Moves: ${r.move_count ?? '-'} | Messiness: ${r.messiness_score ?? '-'} | Insight: ${r.insight_label ?? '-'}</p>
            `;
        })
        .join('<hr />');
}

async function exportGif() {
    if (!window.PLAY_CONFIG.enableGif || !state.sessionId) return;

    const res = await fetch('/api/play/export/gif', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: state.sessionId })
    });

    if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        setStatus(payload.error || 'GIF export failed');
        return;
    }

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cards-session-${state.sessionId}.gif`;
    a.click();
    URL.revokeObjectURL(url);
}

function bindControls() {
    $('displayName').value = state.displayName;
    $('condition').value = state.condition;

    $('startBtn').onclick = () => startSession().catch((e) => setStatus(e.message));
    $('resetBtn').onclick = () => {
        state.moves = [];
        drawBoard();
        setStatus('Board reset.');
    };
    $('completeBtn').onclick = () => completeSession();

    if (window.PLAY_CONFIG.enableGif) {
        $('exportGifBtn').onclick = () => exportGif();
    }

    if ($('participantCompareBtn')) {
        $('participantCompareBtn').onclick = () => compareParticipant().catch((e) => {
            $('participantCompareContent').textContent = e.message || 'Compare failed.';
        });
    }
}

function setupEmbedModeHeight() {
    const params = new URLSearchParams(window.location.search);
    if (params.get('embed') !== '1') return;

    document.body.classList.add('embed-mode');
    const root = $('playApp');
    const send = () => {
        const h = Math.min(2200, Math.max(520, Math.ceil(root.getBoundingClientRect().height)));
        const origin = window.PLAY_CONFIG.parentOrigin || '*';
        window.parent.postMessage({ type: 'cards-embed-height', height: h }, origin);
    };

    const ro = new ResizeObserver(() => setTimeout(send, 120));
    ro.observe(root);
    window.addEventListener('load', send);
}

function init() {
    bindTabs();
    bindControls();
    drawPalette();
    drawBoard();
    renderResults();
    loadHistory();
    setupEmbedModeHeight();
}

init();
