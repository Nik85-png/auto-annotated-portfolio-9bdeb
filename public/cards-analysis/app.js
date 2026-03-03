const analysisDefinitions = {
    1: { title: 'Successful Clean Patterns (Many Moves)', explanation: 'Successful participants with many exploratory moves while keeping structure.' },
    2: { title: 'Failed Messy Patterns (Few Moves)', explanation: 'Failed trials where organization breaks down early.' },
    3: { title: 'All Successful Trials', explanation: 'All success outcomes to compare multiple winning paths.' },
    4: { title: 'In-Trial Progression (Early vs Late)', explanation: 'Grid highlights move phases: blue border = early (first 1/3 of moves), orange border = late (last 1/3).' },
    5: { title: 'Opening Strategies (First 5 Moves)', explanation: 'First moves that shape final outcomes.' },
    6: { title: 'Retry and Recovery Patterns', explanation: 'All valid trials are included, with failed trials listed first so recovery comparisons are easier.' },
    7: { title: 'Extreme Cases (Cleanest vs Messiest)', explanation: 'Best and worst spatial organization cases.' },
    8: { title: 'Speed Comparison (Quick vs Slow Solvers)', explanation: 'Efficiency versus exploration in successful runs.' },
    9: { title: 'Card Repetition Patterns', explanation: 'Focused repetition versus broad exploration.' }
};

const state = {
    data: null,
    analysis: [],
    allValidTrials: [],
    currentAnalysisIdx: 0,
    currentTrialIdx: 0,
    currentMoveIdx: 0,
    playing: false,
    showingFinalState: false,
    speed: 800,
    timer: null,
    outcomeFilter: 'all',
    customPickedKeys: null
};

const MIN_VALID_MOVES = 6;
const EMBED_MIN = 520;
const EMBED_MAX = 1800;
const HEIGHT_THRESHOLD = 8;
let lastSentHeight = 0;
let heightTimer = null;

const $ = (id) => document.getElementById(id);

function isBlank(card) {
    if (!card) return false;
    return card.is_blank === true || String(card.value || '').toUpperCase() === 'BLANK';
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

function setupTabs() {
    document.querySelectorAll('.tab').forEach((tab) => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.tab').forEach((t) => t.classList.remove('active'));
            document.querySelectorAll('.panel').forEach((p) => p.classList.remove('active'));
            tab.classList.add('active');
            const panel = $(tab.dataset.panel);
            if (panel) panel.classList.add('active');
            scheduleEmbedHeight(false);
            resizeCharts();
        });
    });
}

function setupEmbedMode() {
    const embedMode = new URLSearchParams(window.location.search).get('embed') === '1';
    if (!embedMode) return;
    document.body.classList.add('embed-mode');
    const tabs = document.querySelector('.tabs');
    const overview = $('overview');
    const stats = $('statistics');
    const animations = $('animations');
    if (tabs) tabs.style.display = 'none';
    if (overview) overview.classList.remove('active');
    if (stats) stats.classList.remove('active');
    if (animations) animations.classList.add('active');

    if (typeof ResizeObserver !== 'undefined') {
        const ro = new ResizeObserver(() => scheduleEmbedHeight(false));
        ro.observe($('cardsContainer'));
    }
    window.addEventListener('resize', () => scheduleEmbedHeight(false));
    window.addEventListener('load', () => scheduleEmbedHeight(true));
    scheduleEmbedHeight(true);
}

function postEmbedHeight(force = false) {
    if (!document.body.classList.contains('embed-mode')) return;
    const root = $('cardsContainer');
    if (!root) return;
    const measured = Math.ceil(root.getBoundingClientRect().height);
    const clamped = Math.max(EMBED_MIN, Math.min(EMBED_MAX, measured));
    if (!force && Math.abs(clamped - lastSentHeight) <= HEIGHT_THRESHOLD) return;
    lastSentHeight = clamped;
    window.parent.postMessage({ type: 'cards-embed-height', height: clamped }, window.location.origin);
}

function scheduleEmbedHeight(force = false) {
    if (!document.body.classList.contains('embed-mode')) return;
    clearTimeout(heightTimer);
    heightTimer = setTimeout(() => postEmbedHeight(force), 120);
}

function renderStats() {
    const stats = state.data?.statistics || {};
    const total = Number(stats.total_trials || 229);
    const successRate = Number(stats.success_rate || 46.7);
    const blankRate = Number(stats.blank_card_success_rate || 73.3);
    const noBlankRate = Number(stats.no_blank_success_rate || 37.3);
    $('statsBar').innerHTML = [
        ['Total Trials', total],
        ['Success Rate', `${successRate.toFixed(1)}%`],
        ['Success With Blank', `${blankRate.toFixed(1)}%`],
        ['Success Without Blank', `${noBlankRate.toFixed(1)}%`]
    ].map(([label, value]) => `<div class="stat"><div class="value">${value}</div><div class="label">${label}</div></div>`).join('');
}

function trialMoveCount(trial) {
    return Number(trial.move_count ?? (trial.moves || []).length) || 0;
}

function normalizeTrial(trial) {
    const moves = Array.isArray(trial.moves)
        ? trial.moves.filter((m) => Number.isInteger(m?.row) && Number.isInteger(m?.col))
        : [];
    return {
        ...trial,
        moves,
        move_count: trialMoveCount({ ...trial, moves }),
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
    trials.forEach((t) => map.set(trialIdKey(t), t));
    return Array.from(map.values());
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
    const rawAnalyses = Array.isArray(data?.analysis_types) ? data.analysis_types : [];
    const allRaw = rawAnalyses.flatMap((a) => (a.trials || []).map((t) => normalizeTrial(t)));
    const nonEmpty = dedupeTrials(allRaw.filter((t) => t.moves.length > 0));
    const valid = nonEmpty.filter((t) => t.move_count >= MIN_VALID_MOVES);
    const success = valid.filter((t) => t.outcome === 'success');
    const fail = valid.filter((t) => t.outcome !== 'success');

    state.allValidTrials = valid;

    const byId = {};
    rawAnalyses.forEach((a) => { byId[a.id] = a; });

    const idToTrials = {
        1: success.filter((t) => t.move_count >= 15).slice(0, 24),
        2: fail.filter((t) => t.move_count < 15).slice(0, 24),
        3: success.slice(0, 32),
        4: [...valid].sort((a, b) => Math.abs(progressionDelta(b)) - Math.abs(progressionDelta(a))),
        5: valid.filter((t) => t.moves.length >= 5).slice(0, 32).map((t) => ({ ...t, moves: t.moves.slice(0, 5), move_count: 5 })),
        6: [...fail, ...success],
        7: (() => {
            const sorted = [...valid].sort((a, b) => messiness(a) - messiness(b));
            return [...sorted.slice(0, 6), ...sorted.slice(-6)];
        })(),
        8: (() => {
            const sorted = [...success].sort((a, b) => a.move_count - b.move_count);
            return [...sorted.slice(0, 8), ...sorted.slice(-8)];
        })(),
        9: (() => {
            const sorted = [...valid].sort((a, b) => repetitionRatio(b) - repetitionRatio(a));
            return [...sorted.slice(0, 8), ...sorted.slice(-8)];
        })()
    };

    return [1, 2, 3, 4, 5, 6, 7, 8, 9].map((id) => {
        const base = byId[id] || { id, title: `Analysis ${id}`, trials: [] };
        const derived = idToTrials[id] || [];
        const fallback = (base.trials || []).map((t) => normalizeTrial(t)).filter((t) => t.moves.length > 0);
        return {
            ...base,
            ...(analysisDefinitions[id] || {}),
            trials: derived.length ? dedupeTrials(derived) : dedupeTrials(fallback)
        };
    });
}

function currentAnalysis() {
    return state.analysis[state.currentAnalysisIdx] || { id: -1, trials: [] };
}

function messinessThresholds() {
    const scores = (state.allValidTrials || [])
        .map((t) => messiness(t))
        .filter(Number.isFinite)
        .sort((a, b) => a - b);
    if (scores.length < 6) return { cleanMax: 1.5, messyMin: 3.0 };
    return {
        cleanMax: scores[Math.floor(scores.length * 0.33)],
        messyMin: scores[Math.floor(scores.length * 0.67)]
    };
}

function getDisplayTrials() {
    let pool;
    if (state.customPickedKeys) {
        pool = (state.allValidTrials || []).filter((t) => state.customPickedKeys.has(trialIdKey(t)));
    } else {
        pool = currentAnalysis().trials || [];
    }
    if (state.outcomeFilter === 'all') return pool;
    const { cleanMax, messyMin } = messinessThresholds();
    if (state.outcomeFilter === 'success') return pool.filter((t) => t.outcome === 'success');
    if (state.outcomeFilter === 'fail') return pool.filter((t) => t.outcome !== 'success');
    if (state.outcomeFilter === 'clean') return pool.filter((t) => messiness(t) <= cleanMax);
    if (state.outcomeFilter === 'messy') return pool.filter((t) => messiness(t) >= messyMin);
    return pool;
}

function currentTrial() {
    return getDisplayTrials()[state.currentTrialIdx] || null;
}

function renderAnalysisSelect() {
    const select = $('analysisType');
    select.innerHTML = '';
    state.analysis.forEach((a, idx) => {
        const opt = document.createElement('option');
        opt.value = String(idx);
        opt.textContent = a.title || `Analysis ${a.id}`;
        select.appendChild(opt);
    });
    select.value = String(state.currentAnalysisIdx);
    select.onchange = () => {
        state.currentAnalysisIdx = parseInt(select.value, 10) || 0;
        state.currentTrialIdx = 0;
        state.currentMoveIdx = 0;
        state.showingFinalState = false;
        state.outcomeFilter = 'all';
        state.customPickedKeys = null;
        stopPlayback();
        $('finalStateBtn').classList.remove('active');
        $('modeIndicator').classList.remove('active');
        renderAnalysisExplanation();
        renderOutcomeFilter();
        renderTrialSelect();
        renderTrial();
    };
}

function renderAnalysisExplanation() {
    $('analysisText').textContent = currentAnalysis().explanation || '';
}

function renderOutcomeFilter() {
    const el = $('outcomeFilter');
    if (!el) return;
    const filters = [
        { key: 'all', label: 'All' },
        { key: 'success', label: 'Success' },
        { key: 'fail', label: 'Failed' },
        { key: 'clean', label: 'Clean' },
        { key: 'messy', label: 'Messy' }
    ];
    el.innerHTML = filters
        .map((f) => `<button type="button" class="filter-chip${state.outcomeFilter === f.key ? ' active' : ''}" data-filter="${f.key}">${f.label}</button>`)
        .join('');
    el.querySelectorAll('.filter-chip').forEach((btn) => {
        btn.addEventListener('click', () => {
            state.outcomeFilter = btn.dataset.filter;
            state.currentTrialIdx = 0;
            state.currentMoveIdx = 0;
            state.showingFinalState = false;
            stopPlayback();
            $('finalStateBtn').classList.remove('active');
            $('modeIndicator').classList.remove('active');
            renderOutcomeFilter();
            renderTrialSelect();
            renderTrial();
        });
    });

    const pickerBtn = $('openPickerBtn');
    if (pickerBtn) {
        pickerBtn.textContent = state.customPickedKeys
            ? `Choose Trials (${state.customPickedKeys.size} picked)`
            : 'Choose Trials...';
    }
}

function renderTrialSelect() {
    const select = $('trialSelect');
    const trials = getDisplayTrials();
    select.innerHTML = '';
    if (!trials.length) {
        select.innerHTML = '<option>No trials match current filters</option>';
        return;
    }
    trials.forEach((trial, idx) => {
        const participant = trial.participant || 'N/A';
        const outcome = trial.outcome === 'success' ? 'SUCCESS' : 'FAIL';
        const condition = trial.condition || 'N/A';
        const moves = Number(trial.move_count ?? (trial.moves || []).length);
        const blankTag = (trial.blank_card_count || 0) > 0 || hasBlankInFinal(trial) ? ' [blank]' : '';
        const opt = document.createElement('option');
        opt.value = String(idx);
        opt.textContent = `Trial ${idx + 1} [P${participant}] ${outcome} | ${condition} | ${moves} moves${blankTag}`;
        select.appendChild(opt);
    });
    select.value = String(state.currentTrialIdx);
    select.onchange = () => {
        state.currentTrialIdx = parseInt(select.value, 10) || 0;
        state.currentMoveIdx = 0;
        state.showingFinalState = false;
        stopPlayback();
        $('finalStateBtn').classList.remove('active');
        $('modeIndicator').classList.remove('active');
        renderTrial();
    };
}

function hasBlankInFinal(trial) {
    if (!Array.isArray(trial?.final_state)) return false;
    return trial.final_state.some((c) => isBlank(c));
}

function countBlankInFinal(trial) {
    if (!Array.isArray(trial?.final_state)) return 0;
    return trial.final_state.filter((c) => isBlank(c)).length;
}

function renderGrid() {
    const trial = currentTrial();
    const root = $('grid');
    root.innerHTML = '';

    root.innerHTML += '<div class="cell head"></div>';
    for (let c = 0; c < 8; c++) root.innerHTML += `<div class="cell head">${c}</div>`;

    if (!trial) {
        for (let r = 0; r < 8; r++) {
            root.innerHTML += `<div class="cell head">${r}</div>`;
            for (let c = 0; c < 8; c++) root.innerHTML += '<div class="cell empty"></div>';
        }
        $('moveCounter').textContent = 'Move 0 / 0';
        return;
    }

    const isProgression = currentAnalysis().id === 4;
    const moves = trial.moves || [];
    const totalMoves = moves.length;
    const gridState = {};

    if (state.showingFinalState && Array.isArray(trial.final_state) && trial.final_state.length) {
        trial.final_state.forEach((m) => {
            if (Number.isInteger(m?.row) && Number.isInteger(m?.col)) {
                gridState[`${m.row}-${m.col}`] = { ...m, current: false, arrayIndex: -1 };
            }
        });
    } else {
        for (let i = 0; i <= state.currentMoveIdx && i < totalMoves; i++) {
            const m = moves[i];
            if (Number.isInteger(m?.row) && Number.isInteger(m?.col)) {
                gridState[`${m.row}-${m.col}`] = { ...m, current: i === state.currentMoveIdx, arrayIndex: i };
            }
        }
    }

    for (let r = 0; r < 8; r++) {
        root.innerHTML += `<div class="cell head">${r}</div>`;
        for (let c = 0; c < 8; c++) {
            const m = gridState[`${r}-${c}`];
            if (!m) {
                root.innerHTML += '<div class="cell empty"></div>';
                continue;
            }
            const blank = isBlank(m);
            let phaseClass = '';
            if (!state.showingFinalState && isProgression && !m.current && totalMoves >= 6) {
                const seg = Math.max(2, Math.floor(totalMoves / 3));
                const ai = m.arrayIndex ?? 0;
                if (ai < seg) phaseClass = ' phase-early';
                else if (ai >= totalMoves - seg) phaseClass = ' phase-late';
            }
            const cls = `cell card-cell${m.current ? ' current' : ''}${blank ? ' blank' : ''}${phaseClass}`;
            const symbol = blank ? '&#9633;' : `${m.value || ''}${m.suit_symbol || ''}`;
            const color = blank ? '#ffffff' : (m.color === 'red' ? '#dc2626' : '#111827');
            root.innerHTML += `<div class="${cls}" style="color:${color}">${symbol}</div>`;
        }
    }

    if (state.showingFinalState) {
        const finalCards = Array.isArray(trial.final_state) ? trial.final_state.length : 0;
        $('moveCounter').textContent = `Final State: ${finalCards} cards placed`;
    } else {
        const current = totalMoves ? Math.min(state.currentMoveIdx + 1, totalMoves) : 0;
        $('moveCounter').textContent = `Move ${current} / ${totalMoves}`;
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
    const blankCount = countBlankInFinal(trial);
    $('trialInfo').innerHTML = `
        <p><strong>Participant:</strong> ${trial.participant || 'N/A'}</p>
        <p><strong>Outcome:</strong> ${outcome}</p>
        <p><strong>Condition:</strong> ${trial.condition || 'N/A'}</p>
        <p><strong>Total Moves:</strong> ${moves}</p>
        <p><strong>Messiness Score:</strong> ${typeof trial.messiness_score === 'number' ? trial.messiness_score.toFixed(2) : 'N/A'}</p>
        <p><strong>Blank Cards:</strong> ${Number(trial.blank_card_count || blankCount || 0)}</p>
    `;
}

function renderTrial() {
    renderAnalysisExplanation();
    renderGrid();
    renderTrialInfo();
    scheduleEmbedHeight(false);
}

function stopPlayback() {
    state.playing = false;
    clearInterval(state.timer);
    $('playBtn').textContent = 'Play';
}

function togglePlayback() {
    if (state.showingFinalState) return;
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

function toggleFinalState() {
    state.showingFinalState = !state.showingFinalState;
    if (state.showingFinalState) {
        stopPlayback();
        $('finalStateBtn').classList.add('active');
        $('finalStateBtn').textContent = 'Show Animation';
        $('modeIndicator').classList.add('active');
    } else {
        $('finalStateBtn').classList.remove('active');
        $('finalStateBtn').textContent = 'Show Final State';
        $('modeIndicator').classList.remove('active');
    }
    renderTrial();
}

function bindControls() {
    $('openPickerBtn').onclick = openTrialPicker;
    $('pickerClose').onclick = closeTrialPicker;

    $('resetBtn').onclick = () => {
        stopPlayback();
        state.currentMoveIdx = 0;
        state.showingFinalState = false;
        $('finalStateBtn').classList.remove('active');
        $('finalStateBtn').textContent = 'Show Final State';
        $('modeIndicator').classList.remove('active');
        renderTrial();
    };
    $('prevBtn').onclick = () => {
        if (state.showingFinalState) return;
        stopPlayback();
        state.currentMoveIdx = Math.max(0, state.currentMoveIdx - 1);
        renderTrial();
    };
    $('nextBtn').onclick = () => {
        if (state.showingFinalState) return;
        stopPlayback();
        const trial = currentTrial();
        const max = Math.max(0, (trial?.moves || []).length - 1);
        state.currentMoveIdx = Math.min(max, state.currentMoveIdx + 1);
        renderTrial();
    };
    $('playBtn').onclick = togglePlayback;
    $('finalStateBtn').onclick = toggleFinalState;

    $('speedControl').oninput = () => {
        state.speed = parseInt($('speedControl').value, 10) || 800;
        const factor = (2000 - state.speed) / 1000;
        $('speedLabel').textContent = `${factor.toFixed(1)}x`;
        if (state.playing) {
            stopPlayback();
            togglePlayback();
        }
    };
}

function chartLayout(yTitle, range = null) {
    return {
        margin: { t: 20, l: 50, r: 20, b: 50 },
        paper_bgcolor: 'rgba(0,0,0,0)',
        plot_bgcolor: 'rgba(0,0,0,0)',
        font: { color: '#1f2937' },
        yaxis: { title: yTitle, range: range || undefined }
    };
}

function trialKeyForChart(trial) {
    return [
        trial.participant || '',
        trial.condition || '',
        trial.outcome || '',
        numeric(trial.move_count ?? (trial.moves || []).length),
        Number(numeric(trial.messiness_score).toFixed(4))
    ].join('|');
}

function getUniqueTrials() {
    const all = (state.analysis || []).flatMap((a) => a.trials || []);
    const map = new Map();
    all.forEach((trial) => {
        const t = normalizeTrial(trial);
        if (t.moves.length > 0) map.set(trialKeyForChart(t), t);
    });
    return Array.from(map.values());
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

    Plotly.newPlot('summaryBar', [{ x: ['Total Trials', 'Successful', 'Failed'], y: [trials.length, successful.length, failed.length], type: 'bar', marker: { color: ['#667eea', '#10b981', '#ef4444'] } }], chartLayout('Count'), { displayModeBar: false, responsive: true });

    Plotly.newPlot('conditionBar', [{ x: conditions, y: conditions.map((condition) => {
        const group = trials.filter((t) => t.condition === condition);
        return rate(group.filter((t) => t.outcome === 'success').length, group.length);
    }), type: 'bar', marker: { color: '#2a9d8f' }, texttemplate: '%{y:.1f}%', textposition: 'outside' }], chartLayout('Success Rate (%)', [0, 100]), { displayModeBar: false, responsive: true });

    Plotly.newPlot('messinessBar', [{ x: ['Success Group', 'Failure Group'], y: [successMessinessAvg, failMessinessAvg], type: 'bar', marker: { color: ['#10b981', '#ef4444'] }, texttemplate: '%{y:.2f}', textposition: 'outside' }], chartLayout('Messiness Score'), { displayModeBar: false, responsive: true });

    Plotly.newPlot('moveDistBar', [
        { x: successful.map((t) => numeric(t.move_count)), type: 'histogram', name: 'Success', opacity: 0.65, marker: { color: '#10b981' } },
        { x: failed.map((t) => numeric(t.move_count)), type: 'histogram', name: 'Failure', opacity: 0.65, marker: { color: '#ef4444' } }
    ], { ...chartLayout('Trials'), barmode: 'overlay', xaxis: { title: 'Move Count' } }, { displayModeBar: false, responsive: true });

    Plotly.newPlot('blankCardBar', [{ x: ['With Blank Card', 'Without Blank Card'], y: [blankSuccessRate, noBlankSuccessRate], type: 'bar', marker: { color: ['#0ea5e9', '#64748b'] }, texttemplate: '%{y:.1f}%', textposition: 'outside' }], chartLayout('Success Rate (%)', [0, 100]), { displayModeBar: false, responsive: true });

    Plotly.newPlot('messinessBoxBar', [
        { y: successful.map((t) => numeric(t.messiness_score)), type: 'box', name: 'Success', marker: { color: '#10b981' }, boxmean: true },
        { y: failed.map((t) => numeric(t.messiness_score)), type: 'box', name: 'Failure', marker: { color: '#ef4444' }, boxmean: true }
    ], chartLayout('Messiness Score'), { displayModeBar: false, responsive: true });

    window.addEventListener('resize', resizeCharts);
}

function resizeCharts() {
    ['summaryBar', 'conditionBar', 'messinessBar', 'moveDistBar', 'blankCardBar', 'messinessBoxBar'].forEach((id) => {
        const el = $(id);
        if (el) Plotly.Plots.resize(el);
    });
}

let pickerFilter = 'all';
let pickerSearch = '';
let pickerChecked = new Set();

function openTrialPicker() {
    pickerFilter = 'all';
    pickerSearch = '';
    pickerChecked = state.customPickedKeys
        ? new Set(state.customPickedKeys)
        : new Set((currentAnalysis().trials || []).map((t) => trialIdKey(t)));
    const modal = $('trialPickerModal');
    if (!modal) return;
    modal.style.display = 'flex';
    renderTrialPicker();
}

function closeTrialPicker() {
    const modal = $('trialPickerModal');
    if (modal) modal.style.display = 'none';
}

function pickerPool() {
    const all = state.allValidTrials || [];
    const { cleanMax, messyMin } = messinessThresholds();
    let pool;
    if (pickerFilter === 'success') pool = all.filter((t) => t.outcome === 'success');
    else if (pickerFilter === 'fail') pool = all.filter((t) => t.outcome !== 'success');
    else if (pickerFilter === 'clean') pool = all.filter((t) => messiness(t) <= cleanMax);
    else if (pickerFilter === 'messy') pool = all.filter((t) => messiness(t) >= messyMin);
    else pool = all;

    const q = pickerSearch.trim().toLowerCase();
    if (!q) return pool;
    return pool.filter((t) =>
        String(t.participant || '').toLowerCase().includes(q) ||
        String(t.condition || '').toLowerCase().includes(q) ||
        String(t.outcome || '').toLowerCase().includes(q)
    );
}

function renderTrialPicker() {
    const fb = $('pickerFilterBar');
    if (fb) {
        const filters = [['all', 'All'], ['success', 'Success'], ['fail', 'Failed'], ['clean', 'Clean'], ['messy', 'Messy']];
        fb.innerHTML = filters
            .map(([k, label]) => `<button type="button" class="filter-chip${pickerFilter === k ? ' active' : ''}" data-pf="${k}">${label}</button>`)
            .join('');
        fb.querySelectorAll('[data-pf]').forEach((btn) => {
            btn.onclick = () => {
                pickerFilter = btn.dataset.pf;
                renderTrialPicker();
            };
        });
    }

    const search = $('pickerSearch');
    if (search) {
        search.value = pickerSearch;
        search.oninput = () => {
            pickerSearch = search.value;
            renderTrialPicker();
        };
    }

    const count = $('pickerCount');
    if (count) count.textContent = `${pickerChecked.size} selected`;

    const list = $('pickerList');
    if (!list) return;
    const pool = pickerPool();
    if (!pool.length) {
        list.innerHTML = '<p style="padding:8px;color:#6b7280">No trials match.</p>';
        return;
    }

    list.innerHTML = pool.map((t) => {
        const key = trialIdKey(t);
        const checked = pickerChecked.has(key) ? 'checked' : '';
        const ok = t.outcome === 'success';
        const icon = ok ? 'SUCCESS' : 'FAIL';
        const mc = Number(t.move_count ?? (t.moves || []).length);
        const ms = typeof t.messiness_score === 'number' ? t.messiness_score.toFixed(2) : '?';
        const blankTag = (t.blank_card_count || 0) > 0 ? ' [B]' : '';
        return `<label style="display:flex;align-items:center;gap:8px;padding:5px 6px;cursor:pointer;border-radius:6px">
            <input type="checkbox" data-key="${key}" ${checked}>
            <span style="color:${ok ? '#10b981' : '#ef4444'};font-weight:700">${icon}</span>
            <span style="font-size:0.78rem">P${t.participant || 'N/A'} | ${t.condition || '?'} | ${mc} moves | mess ${ms}${blankTag}</span>
        </label>`;
    }).join('');

    list.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
        cb.onchange = () => {
            if (cb.checked) pickerChecked.add(cb.dataset.key);
            else pickerChecked.delete(cb.dataset.key);
            const c = $('pickerCount');
            if (c) c.textContent = `${pickerChecked.size} selected`;
        };
    });

    $('pickerSelectAll').onclick = () => {
        pickerPool().forEach((t) => pickerChecked.add(trialIdKey(t)));
        renderTrialPicker();
    };

    $('pickerClearAll').onclick = () => {
        pickerPool().forEach((t) => pickerChecked.delete(trialIdKey(t)));
        renderTrialPicker();
    };

    $('pickerApply').onclick = () => {
        state.customPickedKeys = pickerChecked.size ? new Set(pickerChecked) : null;
        state.currentTrialIdx = 0;
        state.currentMoveIdx = 0;
        state.showingFinalState = false;
        stopPlayback();
        closeTrialPicker();
        renderOutcomeFilter();
        renderTrialSelect();
        renderTrial();
    };

    $('pickerReset').onclick = () => {
        state.customPickedKeys = null;
        state.currentTrialIdx = 0;
        state.currentMoveIdx = 0;
        state.showingFinalState = false;
        stopPlayback();
        closeTrialPicker();
        renderOutcomeFilter();
        renderTrialSelect();
        renderTrial();
    };

    const modal = $('trialPickerModal');
    if (modal) {
        modal.onclick = (e) => {
            if (e.target === modal) closeTrialPicker();
        };
    }
}

async function loadData() {
    try {
        const res = await fetch('/data/card_analysis_data.json', { cache: 'no-store' });
        state.data = await res.json();
    } catch (e) {
        state.data = { analysis_types: [], statistics: {} };
    }
    state.analysis = buildAnalysisData(state.data);
}

async function init() {
    setupTabs();
    setupEmbedMode();
    await loadData();
    renderStats();
    renderAnalysisSelect();
    renderOutcomeFilter();
    renderTrialSelect();
    renderTrial();
    bindControls();
    renderCharts();
}

init();
