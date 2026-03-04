const analysisDefinitions = {
    1: { title: 'Successful Clean Patterns (Many Moves)', explanation: 'Successful participants with many exploratory moves while keeping structure.' },
    2: { title: 'Failed Messy Patterns (Few Moves)', explanation: 'Failed trials where organization breaks down early.' },
    3: { title: 'All Successful Trials', explanation: 'All success outcomes to compare multiple winning paths.' },
    4: { title: 'In-Trial Progression (Early vs Late)', explanation: 'Grid highlights move phases: blue border = early (first ⅓ of moves), orange border = late (last ⅓). All trials are included — use the outcome filter or "Choose Trials" to narrow down.' },
    5: { title: 'Opening Strategies (First 5 Moves)', explanation: 'First moves that shape final outcomes.' },
    6: { title: 'Retry and Recovery Patterns', explanation: 'All trials included. Use "Choose Trials" to hand-pick participants across all outcomes and compare their attempts. Filter by outcome type to focus on recovery from failure.' },
    7: { title: 'Extreme Cases (Cleanest vs Messiest)', explanation: 'Best and worst spatial organization cases.' },
    8: { title: 'Speed Comparison (Quick vs Slow Solvers)', explanation: 'Efficiency versus exploration in successful runs.' },
    9: { title: 'Card Repetition Patterns', explanation: 'Focused repetition versus broad exploration.' }
};

const state = {
    data: null,
    analysis: [],
    allValidTrials: [],          // full deduplicated pool for trial picker
    currentAnalysisIdx: 0,
    currentTrialIdx: 0,
    currentMoveIdx: 0,
    playing: false,
    speed: 800,
    timer: null,
    outcomeFilter: 'all',        // 'all' | 'success' | 'fail' | 'clean' | 'messy'
    customPickedKeys: null,      // null = use analysis pool; Set<string> = user picks
    selectedParticipant: 'all'
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
    return getDisplayTrials()[state.currentTrialIdx] || null;
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
        state.outcomeFilter = 'all';
        state.customPickedKeys = null;
        state.selectedParticipant = 'all';
        stopPlayback();
        renderAnalysisExplanation();
        renderOutcomeFilter();
        renderParticipantSelect();
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
    const trials = getDisplayTrials();
    select.innerHTML = '';
    if (trials.length === 0) {
        select.innerHTML = '<option>No trials match current filters</option>';
        return;
    }
    trials.forEach((trial, idx) => {
        const participant = trial.participant || 'N/A';
        const outcome = trial.outcome === 'success' ? 'SUCCESS' : 'FAIL';
        const condition = trial.condition || 'N/A';
        const moves = Number(trial.move_count ?? (trial.moves || []).length);
        const blankTag = trial.has_blank_cards ? ' [blank]' : '';
        const recoveryTag = currentAnalysis().id === 6 ? ` | ${trial.outcome === 'success' ? 'SUCCESS RECOVERY' : 'FAILED ATTEMPT'}` : '';
        const trialNumTag =
            currentAnalysis().id === 6 && Number.isFinite(Number(trial.trial_number))
                ? ` | Trial #${Number(trial.trial_number) + 1}`
                : '';
        const messinessTag =
            currentAnalysis().id === 6
                ? ` | mess ${typeof trial.messiness_score === 'number' ? trial.messiness_score.toFixed(2) : 'N/A'}`
                : '';
        const opt = document.createElement('option');
        opt.value = String(idx);
        opt.textContent = `Trial ${idx + 1} [P${participant}] ${outcome} | ${condition}${trialNumTag} | ${moves} moves${messinessTag}${blankTag}${recoveryTag}`;
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

function renderParticipantSelect() {
    const wrap = $('participantSelectWrap');
    const select = $('participantSelect');
    if (!wrap || !select) return;

    const isRecovery = currentAnalysis().id === 6;
    if (!isRecovery) {
        wrap.style.display = 'none';
        select.innerHTML = '';
        state.selectedParticipant = 'all';
        return;
    }

    wrap.style.display = 'block';
    let pool;
    if (state.customPickedKeys) {
        pool = (state.allValidTrials || []).filter((t) => state.customPickedKeys.has(trialIdKey(t)));
    } else {
        pool = currentAnalysis().trials || [];
    }

    const meta = getRecoveryParticipantMeta(pool);
    const options = [{ value: 'all', label: `All Participants (${meta.length})` }].concat(
        meta.map((m, idx) => {
            const pairTag = m.hasBoth ? ' mixed' : '';
            return {
                value: m.participant,
                label: `#${idx + 1} P${m.participant} (${m.count} trials${pairTag})`
            };
        })
    );

    if (!options.some((o) => o.value === state.selectedParticipant)) {
        state.selectedParticipant = 'all';
    }

    select.innerHTML = options.map((o) => `<option value="${o.value}">${o.label}</option>`).join('');
    select.value = state.selectedParticipant;
    select.onchange = () => {
        state.selectedParticipant = select.value;
        state.currentTrialIdx = 0;
        state.currentMoveIdx = 0;
        stopPlayback();
        renderTrialSelect();
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

function byParticipant(trials) {
    const groups = new Map();
    trials.forEach((t) => {
        const key = String(t.participant || 'N/A');
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(t);
    });
    return groups;
}

function recoveryScoreFromTrials(trials) {
    const fail = trials.filter((t) => t.outcome !== 'success');
    const success = trials.filter((t) => t.outcome === 'success');
    if (!fail.length || !success.length) return Number.NEGATIVE_INFINITY;
    const worstFailMess = Math.max(...fail.map((t) => messiness(t)));
    const bestSuccessMess = Math.min(...success.map((t) => messiness(t)));
    const worstFailMoves = Math.max(...fail.map((t) => numeric(t.move_count)));
    const bestSuccessMoves = Math.max(...success.map((t) => numeric(t.move_count)));
    const messinessGain = worstFailMess - bestSuccessMess;
    const moveGain = Math.max(0, bestSuccessMoves - worstFailMoves);
    return messinessGain + moveGain * 0.12;
}

function compareParticipantKeys(a, b) {
    const an = Number(a);
    const bn = Number(b);
    const aNum = Number.isFinite(an);
    const bNum = Number.isFinite(bn);
    if (aNum && bNum) return an - bn;
    return String(a).localeCompare(String(b));
}

function getRecoveryParticipantMeta(trials) {
    const groups = byParticipant(trials);
    const rows = [];
    groups.forEach((group, participant) => {
        const hasFail = group.some((t) => t.outcome !== 'success');
        const hasSuccess = group.some((t) => t.outcome === 'success');
        rows.push({
            participant,
            score: recoveryScoreFromTrials(group),
            hasBoth: hasFail && hasSuccess,
            count: group.length
        });
    });
    rows.sort((a, b) => {
        if (a.hasBoth !== b.hasBoth) return a.hasBoth ? -1 : 1;
        if (Number.isFinite(a.score) || Number.isFinite(b.score)) return (b.score || 0) - (a.score || 0);
        return compareParticipantKeys(a.participant, b.participant);
    });
    return rows;
}

function sortTrialsForRecoveryParticipant(trials) {
    const fail = trials.filter((t) => t.outcome !== 'success');
    const success = trials.filter((t) => t.outcome === 'success');

    if (fail.length && success.length) {
        const worstFailMess = Math.max(...fail.map((t) => messiness(t)));
        const successRanked = [...success].sort((a, b) => {
            const sa = (worstFailMess - messiness(a)) + numeric(a.move_count) * 0.04;
            const sb = (worstFailMess - messiness(b)) + numeric(b.move_count) * 0.04;
            return sb - sa;
        });
        const failRanked = [...fail].sort((a, b) => messiness(b) - messiness(a));
        return [...successRanked, ...failRanked];
    }

    if (success.length) return [...success].sort((a, b) => messiness(a) - messiness(b));
    return [...fail].sort((a, b) => messiness(b) - messiness(a));
}

function sortTrialsForRecovery(trials) {
    const participantMeta = getRecoveryParticipantMeta(trials);
    const groups = byParticipant(trials);
    const ordered = [];
    participantMeta.forEach((row) => {
        const group = groups.get(row.participant) || [];
        ordered.push(...sortTrialsForRecoveryParticipant(group));
    });
    return ordered;
}

function sortTrialsByTrialNumber(trials) {
    return [...trials].sort((a, b) => {
        const at = Number(a?.trial_number);
        const bt = Number(b?.trial_number);
        const aHas = Number.isFinite(at);
        const bHas = Number.isFinite(bt);
        if (aHas && bHas) return at - bt;
        if (aHas !== bHas) return aHas ? -1 : 1;
        return 0;
    });
}

function buildAnalysisData(data) {
    const rawAnalyses = data.analysis_types || [];
    const allRaw = rawAnalyses.flatMap((a) => (a.trials || []).map((t) => normalizeTrial(t)));
    const nonEmptyRaw = allRaw.filter((t) => t.moves.length > 0);
    const nonEmpty = dedupeTrials(nonEmptyRaw);
    const validAll = nonEmptyRaw.filter((t) => t.move_count >= MIN_VALID_MOVES);
    const valid = dedupeTrials(validAll);
    const success = valid.filter((t) => t.outcome === 'success');
    const fail = valid.filter((t) => t.outcome !== 'success');
    const repeated = repeatParticipants(nonEmpty);
    const repeatedMixed = repeated.filter(([, list]) => {
        const outcomes = new Set(list.map((t) => t.outcome));
        return outcomes.has('success') && outcomes.has('fail');
    });
    // Store full pool for trial picker and outcome filter
    state.allValidTrials = valid;

    const idToTrials = {
        1: success.filter((t) => t.move_count >= 15).slice(0, 24),
        2: fail.filter((t) => t.move_count < 15).slice(0, 24),
        3: success.slice(0, 32),
        // Analysis 4: all valid trials sorted by strongest early-vs-late progression delta
        4: [...valid].sort((a, b) => Math.abs(progressionDelta(b)) - Math.abs(progressionDelta(a))),
        5: valid
            .filter((t) => t.moves.length >= 5)
            .slice(0, 32)
            .map((t) => ({ ...t, moves: t.moves.slice(0, 5), move_count: 5 })),
        // Analysis 6: all trials (fail first so failed → success recovery is front of list)
        6: sortTrialsForRecovery(nonEmptyRaw),
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
        const trials =
            id === 6
                ? (derived.length ? derived : fallback)
                : (derived.length ? dedupeTrials(derived) : dedupeTrials(fallback));
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

    const isProgression = (state.analysis[state.currentAnalysisIdx]?.id === 4);
    const totalMoves = moves.length;
    const gridState = {};
    for (let i = 0; i <= state.currentMoveIdx && i < moves.length; i++) {
        const m = moves[i];
        if (Number.isInteger(m.row) && Number.isInteger(m.col)) {
            gridState[`${m.row}-${m.col}`] = { ...m, current: i === state.currentMoveIdx, arrayIndex: i };
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
            let phaseClass = '';
            if (isProgression && !m.current && totalMoves >= 6) {
                const seg = Math.max(2, Math.floor(totalMoves / 3));
                const ai = m.arrayIndex ?? 0;
                if (ai < seg) phaseClass = ' phase-early';
                else if (ai >= totalMoves - seg) phaseClass = ' phase-late';
            }
            const cls = `cell card-cell${m.current ? ' current' : ''}${blank ? ' blank' : ''}${phaseClass}`;
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
    if ($('openPickerBtn')) $('openPickerBtn').onclick = openTrialPicker;
    if ($('closePickerBtn')) $('closePickerBtn').onclick = closeTrialPicker;
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

// ── Messiness thresholds for clean/messy filter ─────────────────────────────
function messinessThresholds() {
    const all = state.allValidTrials || [];
    const scores = all.map((t) => messiness(t)).filter(Number.isFinite).sort((a, b) => a - b);
    if (scores.length < 6) return { cleanMax: 1.5, messyMin: 3.0 };
    return {
        cleanMax: scores[Math.floor(scores.length * 0.33)],
        messyMin: scores[Math.floor(scores.length * 0.67)]
    };
}

// ── Filtered trial list shown in dropdown ────────────────────────────────────
function getDisplayTrials() {
    let pool;
    if (state.customPickedKeys) {
        pool = (state.allValidTrials || []).filter((t) => state.customPickedKeys.has(trialIdKey(t)));
    } else {
        pool = currentAnalysis().trials || [];
    }
    if (currentAnalysis().id === 6) {
        pool = sortTrialsByTrialNumber(pool);
        if (state.selectedParticipant !== 'all') {
            pool = pool.filter((t) => String(t.participant || 'N/A') === state.selectedParticipant);
            pool = sortTrialsByTrialNumber(pool);
        }
    }
    if (state.outcomeFilter === 'all') return pool;
    const { cleanMax, messyMin } = messinessThresholds();
    if (state.outcomeFilter === 'success') return pool.filter((t) => t.outcome === 'success');
    if (state.outcomeFilter === 'fail')    return pool.filter((t) => t.outcome !== 'success');
    if (state.outcomeFilter === 'clean')   return pool.filter((t) => messiness(t) <= cleanMax);
    if (state.outcomeFilter === 'messy')   return pool.filter((t) => messiness(t) >= messyMin);
    return pool;
}

// ── Outcome filter bar ───────────────────────────────────────────────────────
function renderOutcomeFilter() {
    const el = $('outcomeFilter');
    if (!el) return;
    const pickerBtn = $('openPickerBtn');
    if (pickerBtn) {
        pickerBtn.textContent = state.customPickedKeys
            ? `Choose Trials (${state.customPickedKeys.size} picked)`
            : 'Choose Trials\u2026';
    }
    if (currentAnalysis().id === 4) {
        state.outcomeFilter = 'all';
        el.style.display = 'none';
        el.innerHTML = '';
        return;
    }
    el.style.display = 'flex';
    const filters = [
        { key: 'all',     label: 'All' },
        { key: 'success', label: 'Success' },
        { key: 'fail',    label: 'Failed' },
        { key: 'clean',   label: 'Clean (low mess)' },
        { key: 'messy',   label: 'Messy (high mess)' }
    ];
    el.innerHTML = filters
        .map((f) => `<button type="button" class="filter-btn${state.outcomeFilter === f.key ? ' active' : ''}" data-filter="${f.key}">${f.label}</button>`)
        .join('');
    el.querySelectorAll('.filter-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
            state.outcomeFilter = btn.dataset.filter;
            state.currentTrialIdx = 0;
            state.currentMoveIdx = 0;
            stopPlayback();
            renderOutcomeFilter();
            renderParticipantSelect();
            renderTrialSelect();
            renderTrial();
        });
    });
}

// ── Trial picker modal ───────────────────────────────────────────────────────
let _pickerFilter = 'all';
let _pickerSearch = '';
let _pickerChecked = new Set();

function openTrialPicker() {
    _pickerFilter = 'all';
    _pickerSearch = '';
    _pickerChecked = state.customPickedKeys
        ? new Set(state.customPickedKeys)
        : new Set((currentAnalysis().trials || []).map((t) => trialIdKey(t)));
    const overlay = $('trialPickerOverlay');
    if (!overlay) return;
    overlay.classList.remove('hidden');
    _renderPickerContent();
}

function closeTrialPicker() {
    const overlay = $('trialPickerOverlay');
    if (overlay) overlay.classList.add('hidden');
}

function _pickerPool() {
    const all = state.allValidTrials || [];
    const { cleanMax, messyMin } = messinessThresholds();
    let pool;
    if (_pickerFilter === 'success')    pool = all.filter((t) => t.outcome === 'success');
    else if (_pickerFilter === 'fail')  pool = all.filter((t) => t.outcome !== 'success');
    else if (_pickerFilter === 'clean') pool = all.filter((t) => messiness(t) <= cleanMax);
    else if (_pickerFilter === 'messy') pool = all.filter((t) => messiness(t) >= messyMin);
    else                                pool = all;
    if (_pickerSearch.trim()) {
        const q = _pickerSearch.trim().toLowerCase();
        pool = pool.filter((t) =>
            String(t.participant || '').toLowerCase().includes(q) ||
            String(t.condition || '').toLowerCase().includes(q) ||
            String(t.outcome || '').toLowerCase().includes(q));
    }
    return pool;
}

function _renderPickerContent() {
    // Filter bar
    const fb = $('pickerFilterBar');
    if (fb) {
        const filters = [
            { key: 'all', label: 'All' }, { key: 'success', label: 'Success' },
            { key: 'fail', label: 'Failed' }, { key: 'clean', label: 'Clean' }, { key: 'messy', label: 'Messy' }
        ];
        fb.innerHTML = filters
            .map((f) => `<button type="button" class="filter-btn${_pickerFilter === f.key ? ' active' : ''}" data-pf="${f.key}">${f.label}</button>`)
            .join('');
        fb.querySelectorAll('[data-pf]').forEach((btn) => {
            btn.addEventListener('click', () => { _pickerFilter = btn.dataset.pf; _renderPickerContent(); });
        });
    }
    // Search input
    const si = $('pickerSearch');
    if (si) { si.value = _pickerSearch; si.oninput = () => { _pickerSearch = si.value; _renderPickerContent(); }; }
    // Selected count
    const cl = $('pickerCount');
    if (cl) cl.textContent = `${_pickerChecked.size} selected`;
    // Trial list
    const list = $('pickerList');
    if (!list) return;
    const pool = _pickerPool();
    if (pool.length === 0) { list.innerHTML = '<p class="muted" style="padding:8px">No trials match.</p>'; return; }
    list.innerHTML = pool.map((t) => {
        const key = trialIdKey(t);
        const checked = _pickerChecked.has(key) ? 'checked' : '';
        const ok = t.outcome === 'success';
        const oc = ok ? '#10b981' : '#ef4444';
        const mc = Number(t.move_count ?? (t.moves || []).length);
        const ms = typeof t.messiness_score === 'number' ? t.messiness_score.toFixed(2) : '?';
        const blankTag = (t.blank_card_count || 0) > 0 ? ' [B]' : '';
        return `<label class="picker-item">
            <input type="checkbox" class="picker-cb" data-key="${key}" ${checked} />
            <span class="picker-outcome" style="color:${oc}">${ok ? '\u2713' : '\u2717'}</span>
            <span class="picker-label">P${t.participant || 'N/A'} &middot; ${t.condition || '?'} &middot; ${mc} moves &middot; mess ${ms}${blankTag}</span>
        </label>`;
    }).join('');
    list.querySelectorAll('.picker-cb').forEach((cb) => {
        cb.addEventListener('change', () => {
            if (cb.checked) _pickerChecked.add(cb.dataset.key);
            else _pickerChecked.delete(cb.dataset.key);
            const cl2 = $('pickerCount');
            if (cl2) cl2.textContent = `${_pickerChecked.size} selected`;
        });
    });
    const sa = $('pickerSelectAll');
    if (sa) sa.onclick = () => { _pickerPool().forEach((t) => _pickerChecked.add(trialIdKey(t))); _renderPickerContent(); };
    const ca = $('pickerClearAll');
    if (ca) ca.onclick = () => { _pickerPool().forEach((t) => _pickerChecked.delete(trialIdKey(t))); _renderPickerContent(); };
    const ap = $('pickerApply');
    if (ap) ap.onclick = () => {
        state.customPickedKeys = _pickerChecked.size > 0 ? new Set(_pickerChecked) : null;
        if (currentAnalysis().id === 6) state.selectedParticipant = 'all';
        state.currentTrialIdx = 0;
        state.currentMoveIdx = 0;
        stopPlayback();
        closeTrialPicker();
        renderOutcomeFilter();
        renderParticipantSelect();
        renderTrialSelect();
        renderTrial();
    };
    const rp = $('pickerReset');
    if (rp) rp.onclick = () => {
        state.customPickedKeys = null;
        if (currentAnalysis().id === 6) state.selectedParticipant = 'all';
        state.currentTrialIdx = 0;
        state.currentMoveIdx = 0;
        stopPlayback();
        closeTrialPicker();
        renderOutcomeFilter();
        renderParticipantSelect();
        renderTrialSelect();
        renderTrial();
    };
    // Close on overlay click
    const overlay = $('trialPickerOverlay');
    if (overlay) overlay.onclick = (e) => { if (e.target === overlay) closeTrialPicker(); };
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
    renderOutcomeFilter();
    renderParticipantSelect();
    renderTrialSelect();
    renderTrial();
    bindControls();
    renderCharts();
}

init();
