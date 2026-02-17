const analysisDefinitions = {
    1: { title: 'Successful Clean Patterns (Many Moves)', explanation: 'Successful participants with many exploratory moves while keeping structure.' },
    2: { title: 'Failed Messy Patterns (Few Moves)', explanation: 'Failed trials where organization breaks down early.' },
    3: { title: 'All Successful Trials', explanation: 'All success outcomes to compare multiple winning paths.' },
    4: { title: 'Learning Progression', explanation: 'How organization changes across moves.' },
    5: { title: 'Opening Strategies (First 5 Moves)', explanation: 'First moves that shape final outcomes.' },
    6: { title: 'Retry Progression (Same Person, Multiple Attempts)', explanation: 'Adaptation over repeated attempts.' },
    7: { title: 'Extreme Cases (Cleanest vs Messiest)', explanation: 'Best and worst spatial organization cases.' },
    8: { title: 'Speed Comparison (Quick vs Slow Solvers)', explanation: 'Efficiency versus exploration in successful runs.' },
    9: { title: 'Card Repetition Patterns', explanation: 'Focused repetition versus broad exploration.' }
};

const state = {
    data: null,
    analysis: [],
    currentAnalysisIdx: 0,
    currentTrialIdx: 0,
    currentMoveIdx: 0,
    playing: false,
    speed: 800,
    timer: null
};

const $ = (id) => document.getElementById(id);

function isBlank(card) {
    if (!card) return false;
    return card.is_blank === true || String(card.value || '').toUpperCase() === 'BLANK';
}

function initTabs() {
    // Flask standalone uses one-page layout without section tabs.
}

async function loadData() {
    const res = await fetch('/api/data', { cache: 'no-store' });
    state.data = await res.json();
    const byId = {};
    (state.data.analysis_types || []).forEach((a) => {
        byId[a.id] = a;
    });
    state.analysis = [1, 2, 3, 4, 5, 6, 7, 8, 9].map((id) => {
        const item = byId[id] || { id, title: `Analysis ${id}`, trials: [] };
        return { ...item, ...(analysisDefinitions[id] || {}), trials: item.trials || [] };
    });
}

function renderStats() {
    const stats = state.data?.statistics || {};
    $('stats').innerHTML = [
        ['Total Trials', Number(stats.total_trials || 229)],
        ['Success Rate', `${Number(stats.success_rate || 46.7).toFixed(1)}%`],
        ['Success With Blank', `${Number(stats.blank_card_success_rate || 73.3).toFixed(1)}%`],
        ['Success Without Blank', `${Number(stats.no_blank_success_rate || 37.3).toFixed(1)}%`]
    ]
        .map(([label, value]) => `<div class="stat-card"><div class="stat-value">${value}</div><div class="stat-label">${label}</div></div>`)
        .join('');
}

function currentAnalysis() {
    return state.analysis[state.currentAnalysisIdx] || { trials: [] };
}

function currentTrial() {
    return currentAnalysis().trials[state.currentTrialIdx] || null;
}

function renderAnalysisSelect() {
    const select = $('analysisSelect');
    select.innerHTML = '';
    state.analysis.forEach((analysis, idx) => {
        const opt = document.createElement('option');
        opt.value = String(idx);
        opt.textContent = analysis.title || `Analysis ${analysis.id}`;
        select.appendChild(opt);
    });
    select.value = String(state.currentAnalysisIdx);
    select.onchange = () => {
        state.currentAnalysisIdx = parseInt(select.value, 10) || 0;
        state.currentTrialIdx = 0;
        state.currentMoveIdx = 0;
        stopPlayback();
        renderAnalysisExplanation();
        renderTrialSelect();
        renderTrial();
    };
    renderAnalysisExplanation();
}

function renderAnalysisExplanation() {
    $('analysisExplanation').textContent = currentAnalysis().explanation || '';
}

function renderTrialSelect() {
    const select = $('trialSelect');
    const trials = currentAnalysis().trials || [];
    select.innerHTML = '';
    if (trials.length === 0) {
        select.innerHTML = '<option>No trials available</option>';
        return;
    }
    trials.forEach((trial, idx) => {
        const participant = trial.participant || 'N/A';
        const outcome = trial.outcome === 'success' ? 'SUCCESS' : 'FAIL';
        const moves = Number(trial.move_count ?? (trial.moves || []).length);
        const blankTag = trial.has_blank_cards ? ' [blank]' : '';
        const opt = document.createElement('option');
        opt.value = String(idx);
        opt.textContent = `Trial ${idx + 1} [P${participant}] ${outcome} | ${moves} moves${blankTag}`;
        select.appendChild(opt);
    });
    select.value = String(state.currentTrialIdx);
    select.onchange = () => {
        state.currentTrialIdx = parseInt(select.value, 10) || 0;
        state.currentMoveIdx = 0;
        stopPlayback();
        renderTrial();
    };
}

function renderGrid() {
    const trial = currentTrial();
    const root = $('grid');
    root.innerHTML = '';
    if (!trial) {
        root.innerHTML = '<p class="muted">No trial selected.</p>';
        $('moveCounter').textContent = 'Move 0 / 0';
        return;
    }
    const moves = trial.moves || [];
    const total = moves.length;
    const current = total === 0 ? 0 : Math.min(state.currentMoveIdx + 1, total);
    $('moveCounter').textContent = `Move ${current} / ${total}`;

    const gridState = {};
    for (let i = 0; i <= state.currentMoveIdx && i < moves.length; i++) {
        const m = moves[i];
        if (Number.isInteger(m.row) && Number.isInteger(m.col)) {
            gridState[`${m.row}-${m.col}`] = { ...m, current: i === state.currentMoveIdx };
        }
    }

    root.innerHTML += '<div class="cell head"></div>';
    for (let c = 0; c < 8; c++) root.innerHTML += `<div class="cell head">${c}</div>`;

    for (let r = 0; r < 8; r++) {
        root.innerHTML += `<div class="cell head">${r}</div>`;
        for (let c = 0; c < 8; c++) {
            const m = gridState[`${r}-${c}`];
            if (!m) {
                root.innerHTML += '<div class="cell empty"></div>';
                continue;
            }
            const blank = isBlank(m);
            const cls = `cell card-cell${m.current ? ' current' : ''}${blank ? ' blank' : ''}`;
            const symbol = blank ? '□' : `${m.value || ''}${m.suit_symbol || ''}`;
            const color = blank ? '#ffffff' : m.color === 'red' ? '#dc2626' : '#111827';
            root.innerHTML += `<div class="${cls}" style="color:${color}">${symbol}</div>`;
        }
    }
}

function renderTrialInfo() {
    const trial = currentTrial();
    if (!trial) {
        $('trialInfo').innerHTML = '<p class="muted">No trial selected.</p>';
        return;
    }
    const outcome = trial.outcome === 'success' ? 'Success' : 'Failed';
    const moves = Number(trial.move_count ?? (trial.moves || []).length);
    $('trialInfo').innerHTML = `
        <p><strong>Participant:</strong> ${trial.participant || 'N/A'}</p>
        <p><strong>Outcome:</strong> ${outcome}</p>
        <p><strong>Condition:</strong> ${trial.condition || 'N/A'}</p>
        <p><strong>Total Moves:</strong> ${moves}</p>
        <p><strong>Messiness Score:</strong> ${typeof trial.messiness_score === 'number' ? trial.messiness_score.toFixed(2) : 'N/A'}</p>
        <p><strong>Blank Cards:</strong> ${trial.blank_card_count || 0}</p>
    `;
}

function renderTrial() {
    renderGrid();
    renderTrialInfo();
    scheduleEmbedHeight();
}

function stopPlayback() {
    state.playing = false;
    clearInterval(state.timer);
    $('playBtn').textContent = 'Play';
}

function togglePlayback() {
    const trial = currentTrial();
    if (!trial || !(trial.moves || []).length) return;
    state.playing = !state.playing;
    $('playBtn').textContent = state.playing ? 'Pause' : 'Play';
    if (!state.playing) {
        clearInterval(state.timer);
        return;
    }
    state.timer = setInterval(() => {
        const max = (trial.moves || []).length - 1;
        if (state.currentMoveIdx < max) {
            state.currentMoveIdx += 1;
            renderTrial();
        } else {
            stopPlayback();
        }
    }, state.speed);
}

function bindControls() {
    $('resetBtn').onclick = () => {
        stopPlayback();
        state.currentMoveIdx = 0;
        renderTrial();
    };
    $('prevBtn').onclick = () => {
        stopPlayback();
        state.currentMoveIdx = Math.max(0, state.currentMoveIdx - 1);
        renderTrial();
    };
    $('nextBtn').onclick = () => {
        const trial = currentTrial();
        stopPlayback();
        const max = Math.max(0, (trial?.moves || []).length - 1);
        state.currentMoveIdx = Math.min(max, state.currentMoveIdx + 1);
        renderTrial();
    };
    $('playBtn').onclick = () => togglePlayback();
    $('speedRange').oninput = () => {
        state.speed = parseInt($('speedRange').value, 10) || 800;
        const factor = (2000 - state.speed) / 1000;
        $('speedLabel').textContent = `${factor.toFixed(1)}x`;
        if (state.playing) {
            stopPlayback();
            togglePlayback();
        }
    };
}

function renderCharts() {
    Plotly.newPlot(
        'summaryChart',
        [
            {
                x: ['Total', 'Success', 'Failed'],
                y: [229, 107, 122],
                type: 'bar',
                marker: { color: ['#146c94', '#10b981', '#ef4444'] }
            }
        ],
        { margin: { t: 20, b: 40, l: 40, r: 10 } },
        { displayModeBar: false, responsive: true }
    );
    Plotly.newPlot(
        'messinessChart',
        [
            {
                x: ['Success', 'Failure'],
                y: [0.21, 0.34],
                type: 'bar',
                marker: { color: ['#10b981', '#ef4444'] }
            }
        ],
        { margin: { t: 20, b: 40, l: 40, r: 10 } },
        { displayModeBar: false, responsive: true }
    );
    Plotly.newPlot(
        'blankChart',
        [
            {
                x: ['With Blank', 'Without Blank'],
                y: [73.3, 37.3],
                type: 'bar',
                marker: { color: ['#2a9d8f', '#94a3b8'] }
            }
        ],
        { margin: { t: 20, b: 40, l: 40, r: 10 } },
        { displayModeBar: false, responsive: true }
    );
}

const EMBED_MIN = 520;
const EMBED_MAX = 1800;
const HEIGHT_THRESHOLD = 8;
let lastHeight = 0;
let heightTimer = null;

function getTargetOrigin() {
    const fromConfig = window.CARDS_CONFIG?.parentOrigin;
    if (fromConfig) return fromConfig;
    if (document.referrer) {
        try {
            return new URL(document.referrer).origin;
        } catch (err) {
            return '*';
        }
    }
    return '*';
}

function postEmbedHeight(force = false) {
    if (!document.body.classList.contains('embed-mode')) return;
    const h = Math.ceil($('app').getBoundingClientRect().height);
    const clamped = Math.max(EMBED_MIN, Math.min(EMBED_MAX, h));
    if (!force && Math.abs(clamped - lastHeight) <= HEIGHT_THRESHOLD) return;
    lastHeight = clamped;
    window.parent.postMessage({ type: 'cards-embed-height', height: clamped }, getTargetOrigin());
}

function scheduleEmbedHeight(force = false) {
    if (!document.body.classList.contains('embed-mode')) return;
    clearTimeout(heightTimer);
    heightTimer = setTimeout(() => postEmbedHeight(force), 120);
}

function setupEmbedMode() {
    const params = new URLSearchParams(window.location.search);
    if (params.get('embed') !== '1') return;
    document.body.classList.add('embed-mode');
    if (typeof ResizeObserver !== 'undefined') {
        const observer = new ResizeObserver(() => scheduleEmbedHeight(false));
        observer.observe($('app'));
    }
    window.addEventListener('resize', () => scheduleEmbedHeight(false));
    window.addEventListener('load', () => scheduleEmbedHeight(true));
    scheduleEmbedHeight(true);
}

async function init() {
    initTabs();
    setupEmbedMode();
    await loadData();
    renderStats();
    renderAnalysisSelect();
    renderTrialSelect();
    renderTrial();
    bindControls();
    renderCharts();
}

init();
