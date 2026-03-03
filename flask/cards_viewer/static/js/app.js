const analysisDefinitions = {
    1: { title: 'Successful Clean Patterns (Many Moves)', explanation: 'Successful participants with many exploratory moves while keeping structure.' },
    2: { title: 'Failed Messy Patterns (Few Moves)', explanation: 'Failed trials where organization breaks down early.' },
    3: { title: 'All Successful Trials', explanation: 'All success outcomes to compare multiple winning paths.' },
    4: { title: 'In-Trial Progression (Early vs Late)', explanation: 'Compares how spatial organization changes from the start to the end of each trial.' },
    5: { title: 'Opening Strategies (First 5 Moves)', explanation: 'First moves that shape final outcomes.' },
    6: { title: 'Retry and Recovery Patterns', explanation: 'Highlights repeated participants when available, otherwise contrasts failed and successful strategies.' },
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
const MIN_VALID_MOVES = 6;

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
    state.analysis = buildAnalysisData(state.data);
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

function trialMoveCount(trial) {
    return Number(trial.move_count ?? (trial.moves || []).length) || 0;
}

function normalizeTrial(trial) {
    const moves = Array.isArray(trial.moves) ? trial.moves.filter((m) => Number.isInteger(m?.row) && Number.isInteger(m?.col)) : [];
    const moveCount = trialMoveCount({ ...trial, moves });
    return {
        ...trial,
        moves,
        move_count: moveCount,
        blank_card_count: Number(trial.blank_card_count || 0)
    };
}

function trialIdKey(trial) {
    const first = trial.moves?.[0];
    const last = trial.moves?.[trial.moves.length - 1];
    return [
        trial.participant || '',
        trial.condition || '',
        trial.outcome || '',
        trial.move_count || 0,
        Number(numeric(trial.messiness_score).toFixed(4)),
        first ? `${first.row}-${first.col}-${first.value || ''}` : 'nf',
        last ? `${last.row}-${last.col}-${last.value || ''}` : 'nl'
    ].join('|');
}

function dedupeTrials(trials) {
    const map = new Map();
    trials.forEach((trial) => {
        map.set(trialIdKey(trial), trial);
    });
    return Array.from(map.values());
}

function repeatParticipants(trials) {
    const byP = new Map();
    trials.forEach((t) => {
        const p = String(t.participant || 'N/A');
        if (!byP.has(p)) byP.set(p, []);
        byP.get(p).push(t);
    });
    return Array.from(byP.entries())
        .filter(([, list]) => list.length > 1)
        .sort((a, b) => b[1].length - a[1].length);
}

function messiness(trial) {
    if (typeof trial.messiness_score === 'number') return trial.messiness_score;
    const pts = trial.moves || [];
    if (!pts.length) return 0;
    const avgRow = avg(pts.map((m) => m.row));
    const avgCol = avg(pts.map((m) => m.col));
    return avg(pts.map((m) => Math.hypot(m.row - avgRow, m.col - avgCol)));
}

function repetitionRatio(trial) {
    const moves = trial.moves || [];
    if (!moves.length) return 0;
    const unique = new Set(moves.map((m) => `${m.value || ''}-${m.suit_symbol || ''}-${m.row}-${m.col}`)).size;
    return 1 - unique / moves.length;
}

function progressionDelta(trial) {
    const moves = trial.moves || [];
    if (moves.length < 4) return 0;
    const segmentSize = Math.max(2, Math.floor(moves.length / 3));
    const early = moves.slice(0, segmentSize);
    const late = moves.slice(-segmentSize);
    const spread = (segment) => {
        const cRow = avg(segment.map((m) => m.row));
        const cCol = avg(segment.map((m) => m.col));
        return avg(segment.map((m) => Math.hypot(m.row - cRow, m.col - cCol)));
    };
    return spread(late) - spread(early);
}

function buildAnalysisData(data) {
    const rawAnalyses = data.analysis_types || [];
    const allRaw = rawAnalyses.flatMap((a) => (a.trials || []).map((t) => normalizeTrial(t)));
    const nonEmptyRaw = allRaw.filter((t) => t.moves.length > 0);
    const nonEmpty = dedupeTrials(nonEmptyRaw);
    const valid = nonEmpty.filter((t) => t.move_count >= MIN_VALID_MOVES);
    const success = valid.filter((t) => t.outcome === 'success');
    const fail = valid.filter((t) => t.outcome !== 'success');
    const repeated = repeatParticipants(nonEmpty);
    const repeatedMixed = repeated.filter(([, list]) => {
        const outcomes = new Set(list.map((t) => t.outcome));
        return outcomes.has('success') && outcomes.has('fail');
    });
    const progressionFallback = [...valid]
        .sort((a, b) => Math.abs(progressionDelta(b)) - Math.abs(progressionDelta(a)))
        .slice(0, 16);

    const idToTrials = {
        1: success.filter((t) => t.move_count >= 15).slice(0, 24),
        2: fail.filter((t) => t.move_count < 15).slice(0, 24),
        3: success.slice(0, 32),
        4: (repeated.length
            ? repeated.slice(0, 12).flatMap(([, list]) => list.sort((a, b) => a.move_count - b.move_count))
            : progressionFallback),
        5: valid
            .filter((t) => t.moves.length >= 5)
            .slice(0, 32)
            .map((t) => ({ ...t, moves: t.moves.slice(0, 5), move_count: 5 })),
        6: (repeatedMixed.length
            ? repeatedMixed.slice(0, 16).flatMap(([, list]) => list.sort((a, b) => a.move_count - b.move_count))
            : [...fail.slice(0, 10), ...success.slice(0, 10)]),
        7: (() => {
            const sorted = [...valid].sort((a, b) => messiness(a) - messiness(b));
            return [...sorted.slice(0, 6), ...sorted.slice(-6)];
        })(),
        8: (() => {
            const s = [...success].sort((a, b) => a.move_count - b.move_count);
            return [...s.slice(0, 8), ...s.slice(-8)];
        })(),
        9: (() => {
            const sorted = [...valid].sort((a, b) => repetitionRatio(b) - repetitionRatio(a));
            return [...sorted.slice(0, 8), ...sorted.slice(-8)];
        })()
    };

    const byId = {};
    rawAnalyses.forEach((a) => {
        byId[a.id] = a;
    });

    return [1, 2, 3, 4, 5, 6, 7, 8, 9].map((id) => {
        const base = byId[id] || { id, title: `Analysis ${id}`, trials: [] };
        const derived = idToTrials[id] || [];
        const fallback = (base.trials || []).map((t) => normalizeTrial(t)).filter((t) => t.moves.length > 0);
        const trials = derived.length ? dedupeTrials(derived) : dedupeTrials(fallback);
        return {
            ...base,
            ...(analysisDefinitions[id] || {}),
            trials
        };
    });
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
    const trials = getUniqueTrials();
    const successful = trials.filter((t) => t.outcome === 'success');
    const failed = trials.filter((t) => t.outcome !== 'success');
    const conditions = ['KQ', 'KQB', 'KQJ', 'KQJB'];

    const withBlank = trials.filter((t) => (t.blank_card_count || 0) > 0);
    const withoutBlank = trials.filter((t) => (t.blank_card_count || 0) === 0);
    const blankSuccessRate = rate(withBlank.filter((t) => t.outcome === 'success').length, withBlank.length);
    const noBlankSuccessRate = rate(withoutBlank.filter((t) => t.outcome === 'success').length, withoutBlank.length);
    const successMessinessAvg = avg(successful.map((t) => numeric(t.messiness_score)));
    const failMessinessAvg = avg(failed.map((t) => numeric(t.messiness_score)));

    Plotly.newPlot(
        'summaryChart',
        [
            {
                x: ['Total', 'Success', 'Failed'],
                y: [trials.length, successful.length, failed.length],
                type: 'bar',
                marker: { color: ['#146c94', '#10b981', '#ef4444'] }
            }
        ],
        chartLayout('Count'),
        { displayModeBar: false, responsive: true }
    );
    Plotly.newPlot(
        'conditionChart',
        [
            {
                x: conditions,
                y: conditions.map((condition) => {
                    const group = trials.filter((t) => t.condition === condition);
                    return rate(group.filter((t) => t.outcome === 'success').length, group.length);
                }),
                type: 'bar',
                marker: { color: '#2a9d8f' },
                textposition: 'outside',
                texttemplate: '%{y:.1f}%'
            }
        ],
        chartLayout('Success Rate (%)', [0, 100]),
        { displayModeBar: false, responsive: true }
    );
    Plotly.newPlot(
        'messinessChart',
        [
            {
                x: ['Success', 'Failure'],
                y: [successMessinessAvg, failMessinessAvg],
                type: 'bar',
                marker: { color: ['#10b981', '#ef4444'] }
            }
        ],
        chartLayout('Messiness Score'),
        { displayModeBar: false, responsive: true }
    );
    Plotly.newPlot(
        'moveDistChart',
        [
            {
                x: successful.map((t) => numeric(t.move_count)),
                type: 'histogram',
                name: 'Success',
                opacity: 0.65,
                marker: { color: '#10b981' }
            },
            {
                x: failed.map((t) => numeric(t.move_count)),
                type: 'histogram',
                name: 'Failure',
                opacity: 0.65,
                marker: { color: '#ef4444' }
            }
        ],
        {
            ...chartLayout('Trials'),
            barmode: 'overlay',
            xaxis: { title: 'Move Count' }
        },
        { displayModeBar: false, responsive: true }
    );
    Plotly.newPlot(
        'blankChart',
        [
            {
                x: ['With Blank', 'Without Blank'],
                y: [blankSuccessRate, noBlankSuccessRate],
                type: 'bar',
                marker: { color: ['#2a9d8f', '#94a3b8'] },
                textposition: 'outside',
                texttemplate: '%{y:.1f}%'
            }
        ],
        chartLayout('Success Rate (%)', [0, 100]),
        { displayModeBar: false, responsive: true }
    );
    Plotly.newPlot(
        'messinessBoxChart',
        [
            {
                y: successful.map((t) => numeric(t.messiness_score)),
                type: 'box',
                name: 'Success',
                marker: { color: '#10b981' },
                boxmean: true
            },
            {
                y: failed.map((t) => numeric(t.messiness_score)),
                type: 'box',
                name: 'Failure',
                marker: { color: '#ef4444' },
                boxmean: true
            }
        ],
        chartLayout('Messiness Score'),
        { displayModeBar: false, responsive: true }
    );

    window.addEventListener('resize', resizeCharts);
}

function numeric(v) {
    return typeof v === 'number' && Number.isFinite(v) ? v : Number(v) || 0;
}

function avg(arr) {
    if (!arr.length) return 0;
    return arr.reduce((sum, v) => sum + numeric(v), 0) / arr.length;
}

function rate(part, total) {
    if (!total) return 0;
    return (part / total) * 100;
}

function chartLayout(yTitle, range = null) {
    return {
        margin: { t: 20, b: 45, l: 50, r: 10 },
        paper_bgcolor: 'rgba(0,0,0,0)',
        plot_bgcolor: 'rgba(0,0,0,0)',
        font: { color: '#1f2937' },
        yaxis: {
            title: yTitle,
            range: range || undefined
        }
    };
}

function trialKey(trial) {
    return [
        trial.participant || '',
        trial.condition || '',
        trial.outcome || '',
        numeric(trial.move_count ?? (trial.moves || []).length),
        Number(numeric(trial.messiness_score).toFixed(4))
    ].join('|');
}

function getUniqueTrials() {
    const all = (state.analysis || []).flatMap((analysis) => analysis.trials || []);
    const map = new Map();
    all.forEach((trial) => {
        const normalized = normalizeTrial(trial);
        if (normalized.moves.length > 0) {
            map.set(trialKey(normalized), normalized);
        }
    });
    return Array.from(map.values());
}

function resizeCharts() {
    ['summaryChart', 'conditionChart', 'messinessChart', 'moveDistChart', 'blankChart', 'messinessBoxChart'].forEach((id) => {
        const el = $(id);
        if (el) Plotly.Plots.resize(el);
    });
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
