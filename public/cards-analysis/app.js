const analysisDefinitions={1:{title:'?Successful Clean Patterns (Many Moves)',explanation:'Successful participants with 15+ moves who stayed spatially systematic instead of becoming scattered.'},2:{title:'Failed Messy Patterns (Few Moves)',explanation:'Failed trials with fewer moves where spatial structure breaks down early.'},3:{title:'? All Successful Trials',explanation:'A wider view of successful trials to compare clean and exploratory winning paths.'},4:{title:'?? Learning Progression',explanation:'Tracks whether organization improves or deteriorates across moves in a trial.'},5:{title:'?? Opening Strategies (First 5 Moves)',explanation:'Compares opening behavior and early placement structure between successful and failed runs.'},6:{title:'?? Retry Progression (Same Person, Multiple Attempts)',explanation:'Shows whether participants adjust strategy after failure across multiple attempts.'},7:{title:'? Extreme Cases (Cleanest vs Messiest)',explanation:'Highlights polar spatial patterns to show how structure quality differs at extremes.'},8:{title:'?? Speed Comparison (Quick vs Slow Solvers)',explanation:'Compares quick and slow successful attempts to inspect efficiency versus exploration.'},9:{title:'?? Card Repetition Patterns',explanation:'Compares focused repetition against wider card exploration behavior.'}};
let dataset=null,analysisTypes=[],currentAnalysisIdx=0,currentTrialIdx=0,currentMove=0,isPlaying=false,showingFinalState=false,timer=null,speed=800;
const statsBar=document.getElementById('statsBar'),analysisSelect=document.getElementById('analysisType'),trialSelect=document.getElementById('trialSelect'),analysisText=document.getElementById('analysisText'),moveCounter=document.getElementById('moveCounter'),trialInfo=document.getElementById('trialInfo'),speedControl=document.getElementById('speedControl'),speedLabel=document.getElementById('speedLabel'),finalStateBtn=document.getElementById('finalStateBtn'),modeIndicator=document.getElementById('modeIndicator'),cardsContainer=document.getElementById('cardsContainer');
const urlParams=new URLSearchParams(window.location.search),embedMode=urlParams.get('embed')==='1';
if(embedMode){document.body.classList.add('embed-mode');const tabs=document.querySelector('.tabs'),overview=document.getElementById('overview'),statsPanel=document.getElementById('statistics'),animations=document.getElementById('animations');if(tabs)tabs.style.display='none';if(overview)overview.classList.remove('active');if(statsPanel)statsPanel.classList.remove('active');if(animations)animations.classList.add('active');}
document.querySelectorAll('.tab').forEach((tab)=>{tab.addEventListener('click',()=>{document.querySelectorAll('.tab').forEach((t)=>t.classList.remove('active'));document.querySelectorAll('.panel').forEach((p)=>p.classList.remove('active'));tab.classList.add('active');document.getElementById(tab.dataset.panel).classList.add('active');scheduleEmbedHeight();resizeGraphs();});});
function renderStats(stats){const total=Number(stats.total_trials)||229,successRate=Number(stats.success_rate)||46.7,blankRate=Number(stats.blank_card_success_rate)||73.3,noBlankRate=Number(stats.no_blank_success_rate)||37.3;statsBar.innerHTML=`<div class="stat"><div class="value">${total}</div><div class="label">Total Trials</div></div><div class="stat"><div class="value">${successRate.toFixed(1)}%</div><div class="label">Success Rate</div></div><div class="stat"><div class="value">${blankRate.toFixed(1)}%</div><div class="label">Success With Blank</div></div><div class="stat"><div class="value">${noBlankRate.toFixed(1)}%</div><div class="label">Success Without Blank</div></div>`;}
function initSelectors(){analysisSelect.innerHTML='';analysisTypes.forEach((a,i)=>{const opt=document.createElement('option');opt.value=String(i);opt.textContent=a.title||`Analysis ${i+1}`;analysisSelect.appendChild(opt);});analysisSelect.addEventListener('change',()=>{currentAnalysisIdx=parseInt(analysisSelect.value,10)||0;currentTrialIdx=0;currentMove=0;showingFinalState=false;finalStateBtn.classList.remove('active');modeIndicator.classList.remove('active');rebuildTrialSelector();loadCurrentTrial();});trialSelect.addEventListener('change',()=>{currentTrialIdx=parseInt(trialSelect.value,10)||0;currentMove=0;showingFinalState=false;finalStateBtn.classList.remove('active');modeIndicator.classList.remove('active');loadCurrentTrial();});}
function rebuildTrialSelector(){trialSelect.innerHTML='';const current=analysisTypes[currentAnalysisIdx]||{trials:[]},trials=Array.isArray(current.trials)?current.trials:[];if(trials.length===0){trialSelect.innerHTML='<option>No trials available</option>';return;}trials.forEach((trial,idx)=>{const opt=document.createElement('option'),icon=trial.outcome==='success'?'SUCCESS':'FAIL',participant=trial.participant||'N/A',condition=trial.condition||'N/A',moves=Number(trial.move_count??(Array.isArray(trial.moves)?trial.moves.length:0)),hasBlank=trialHasBlank(trial),blankIndicator=hasBlank?' [blank]':'';opt.value=String(idx);opt.textContent=`Trial ${idx+1} [P${participant}] ${icon} | ${condition} | ${moves} moves${blankIndicator}`;trialSelect.appendChild(opt);});}
function getCurrentTrial(){const analysis=analysisTypes[currentAnalysisIdx];if(!analysis||!Array.isArray(analysis.trials))return null;return analysis.trials[currentTrialIdx]||null;}function trialHasBlank(trial){return Array.isArray(trial?.final_state)&&trial.final_state.some((c)=>c&&(c.is_blank||String(c.value).toUpperCase()==='BLANK'));}function countBlankCards(trial){if(!Array.isArray(trial?.final_state))return 0;return trial.final_state.filter((c)=>c&&(c.is_blank||String(c.value).toUpperCase()==='BLANK')).length;}
function loadCurrentTrial(){const analysis=analysisTypes[currentAnalysisIdx];analysisText.textContent=analysis?.explanation||'';const trial=getCurrentTrial();if(!trial){trialInfo.innerHTML='<p>No trial data available.</p>';renderGrid(null);moveCounter.textContent='Move 0 / 0';scheduleEmbedHeight();return;}renderGrid(trial);const moves=Array.isArray(trial.moves)?trial.moves.length:0;if(showingFinalState){const finalCards=Array.isArray(trial.final_state)?trial.final_state.length:0;moveCounter.textContent=`Final State: ${finalCards} cards placed`;}else{moveCounter.textContent=`Move ${Math.min(currentMove+1,moves)} / ${moves}`;}const outcomeText=trial.outcome==='success'?'Success':'Failed',hasBlank=trialHasBlank(trial),blankCount=hasBlank?countBlankCards(trial):0;trialInfo.innerHTML=`<p><strong>Participant:</strong> ${trial.participant||'N/A'}</p><p><strong>Outcome:</strong> ${outcomeText}</p><p><strong>Condition:</strong> ${trial.condition||'N/A'}</p><p><strong>Total Moves:</strong> ${Number(trial.move_count??moves)}</p><p><strong>Messiness Score:</strong> ${typeof trial.messiness_score==='number'?trial.messiness_score.toFixed(2):'N/A'}</p>${hasBlank?`<p style="color:#f59e0b;font-weight:700;">Uses ${blankCount} blank card${blankCount>1?'s':''}</p>`:''}`;scheduleEmbedHeight();}
function renderGrid(trial){const grid=document.getElementById('grid');grid.innerHTML='';grid.innerHTML+='<div class="cell head"></div>';for(let c=0;c<8;c++)grid.innerHTML+=`<div class="cell head">${c}</div>`;const state={};if(showingFinalState&&trial&&Array.isArray(trial.final_state)){for(const card of trial.final_state){if(card)state[`${card.row}-${card.col}`]={...card,current:false};}}else if(trial&&Array.isArray(trial.moves)){for(let i=0;i<=currentMove&&i<trial.moves.length;i++){const m=trial.moves[i];if(m)state[`${m.row}-${m.col}`]={...m,current:i===currentMove};}}
for(let r=0;r<8;r++){grid.innerHTML+=`<div class="cell head">${r}</div>`;for(let c=0;c<8;c++){const m=state[`${r}-${c}`];if(!m){grid.innerHTML+='<div class="cell empty"></div>';continue;}const symbol=(m.is_blank||String(m.value).toUpperCase()==='BLANK')?'&#9633;':`${m.value||''}${m.suit_symbol||''}`,cls=`cell card-cell${m.current?' current':''}${(m.is_blank||String(m.value).toUpperCase()==='BLANK')?' blank':''}`,color=(m.is_blank||String(m.value).toUpperCase()==='BLANK')?'white':(m.color==='red'?'#dc2626':'#111827');grid.innerHTML+=`<div class="${cls}" style="color:${color}">${symbol}</div>`;}}}
function toggleFinalState(){showingFinalState=!showingFinalState;if(showingFinalState){const currentTrial=getCurrentTrial();if(currentTrial&&!trialHasBlank(currentTrial)){const trials=(analysisTypes[currentAnalysisIdx]&&Array.isArray(analysisTypes[currentAnalysisIdx].trials))?analysisTypes[currentAnalysisIdx].trials:[];const nextBlankIdx=trials.findIndex((t)=>trialHasBlank(t));if(nextBlankIdx>=0){currentTrialIdx=nextBlankIdx;trialSelect.value=String(nextBlankIdx);}}finalStateBtn.classList.add('active');finalStateBtn.textContent='Show Animation';modeIndicator.classList.add('active');if(isPlaying)playPause();}else{finalStateBtn.classList.remove('active');finalStateBtn.textContent='Show Final State';modeIndicator.classList.remove('active');}loadCurrentTrial();}
function playPause(){if(showingFinalState)return;const trial=getCurrentTrial();if(!trial||!Array.isArray(trial.moves)||trial.moves.length===0)return;isPlaying=!isPlaying;document.getElementById('playBtn').textContent=isPlaying?'Pause':'Play';if(!isPlaying){clearInterval(timer);return;}timer=setInterval(()=>{if(currentMove<trial.moves.length-1){currentMove++;loadCurrentTrial();}else{isPlaying=false;document.getElementById('playBtn').textContent='Play';clearInterval(timer);}},speed);}
function nextMove(){if(showingFinalState)return;const trial=getCurrentTrial();if(!trial||!Array.isArray(trial.moves))return;if(currentMove<trial.moves.length-1){currentMove++;loadCurrentTrial();}}
function prevMove(){if(showingFinalState)return;if(currentMove>0){currentMove--;loadCurrentTrial();}}
function resetMove(){currentMove=0;showingFinalState=false;finalStateBtn.classList.remove('active');finalStateBtn.textContent='Show Final State';modeIndicator.classList.remove('active');if(isPlaying){isPlaying=false;clearInterval(timer);document.getElementById('playBtn').textContent='Play';}loadCurrentTrial();}
function setupControls(){document.getElementById('playBtn').addEventListener('click',playPause);document.getElementById('nextBtn').addEventListener('click',nextMove);document.getElementById('prevBtn').addEventListener('click',prevMove);document.getElementById('resetBtn').addEventListener('click',resetMove);finalStateBtn.addEventListener('click',toggleFinalState);speedControl.addEventListener('input',()=>{speed=parseInt(speedControl.value,10)||800;const factor=(2000-speed)/1000;speedLabel.textContent=`${factor.toFixed(1)}x`;});}
function numeric(v){return typeof v==='number'&&Number.isFinite(v)?v:Number(v)||0;}function avg(arr){if(!arr.length)return 0;return arr.reduce((s,v)=>s+numeric(v),0)/arr.length;}function rate(part,total){if(!total)return 0;return(part/total)*100;}function chartLayout(yTitle,range=null){return{margin:{t:20,l:50,r:20,b:50},paper_bgcolor:'rgba(0,0,0,0)',plot_bgcolor:'rgba(0,0,0,0)',font:{color:'#1f2937'},yaxis:{title:yTitle,range:range||undefined}};}function trialKey(t){return[(t.participant||''),(t.condition||''),(t.outcome||''),numeric(t.move_count??(Array.isArray(t.moves)?t.moves.length:0)),Number(numeric(t.messiness_score).toFixed(4))].join('|');}function getUniqueTrials(){const all=(Array.isArray(dataset?.analysis_types)?dataset.analysis_types:[]).flatMap((a)=>Array.isArray(a.trials)?a.trials:[]),m=new Map();all.forEach((t)=>m.set(trialKey(t),t));return Array.from(m.values());}function renderGraphs(){const trials=getUniqueTrials(),successful=trials.filter((t)=>t.outcome==='success'),failed=trials.filter((t)=>t.outcome!=='success'),conditions=['KQ','KQB','KQJ','KQJB'],withBlank=trials.filter((t)=>numeric(t.blank_card_count)>0),withoutBlank=trials.filter((t)=>numeric(t.blank_card_count)===0),blankSuccessRate=rate(withBlank.filter((t)=>t.outcome==='success').length,withBlank.length),noBlankSuccessRate=rate(withoutBlank.filter((t)=>t.outcome==='success').length,withoutBlank.length),successMessAvg=avg(successful.map((t)=>numeric(t.messiness_score))),failMessAvg=avg(failed.map((t)=>numeric(t.messiness_score)));Plotly.newPlot('summaryBar',[{x:['Total Trials','Successful','Failed'],y:[trials.length,successful.length,failed.length],type:'bar',marker:{color:['#667eea','#10b981','#ef4444']}}],chartLayout('Count'),{displayModeBar:false,responsive:true});Plotly.newPlot('conditionBar',[{x:conditions,y:conditions.map((condition)=>{const group=trials.filter((t)=>t.condition===condition);return rate(group.filter((t)=>t.outcome==='success').length,group.length);}),type:'bar',marker:{color:'#2a9d8f'},texttemplate:'%{y:.1f}%',textposition:'outside'}],chartLayout('Success Rate (%)',[0,100]),{displayModeBar:false,responsive:true});Plotly.newPlot('messinessBar',[{x:['Success Group','Failure Group'],y:[successMessAvg,failMessAvg],type:'bar',marker:{color:['#10b981','#ef4444']},texttemplate:'%{y:.2f}',textposition:'outside'}],chartLayout('Messiness Score'),{displayModeBar:false,responsive:true});Plotly.newPlot('moveDistBar',[{x:successful.map((t)=>numeric(t.move_count??(Array.isArray(t.moves)?t.moves.length:0))),type:'histogram',name:'Success',opacity:.65,marker:{color:'#10b981'}},{x:failed.map((t)=>numeric(t.move_count??(Array.isArray(t.moves)?t.moves.length:0))),type:'histogram',name:'Failure',opacity:.65,marker:{color:'#ef4444'}}],{...chartLayout('Trials'),barmode:'overlay',xaxis:{title:'Move Count'}},{displayModeBar:false,responsive:true});Plotly.newPlot('blankCardBar',[{x:['With Blank Card','Without Blank Card'],y:[blankSuccessRate,noBlankSuccessRate],type:'bar',marker:{color:['#0ea5e9','#64748b']},texttemplate:'%{y:.1f}%',textposition:'outside'}],chartLayout('Success Rate (%)',[0,100]),{displayModeBar:false,responsive:true});Plotly.newPlot('messinessBoxBar',[{y:successful.map((t)=>numeric(t.messiness_score)),type:'box',name:'Success',marker:{color:'#10b981'},boxmean:true},{y:failed.map((t)=>numeric(t.messiness_score)),type:'box',name:'Failure',marker:{color:'#ef4444'},boxmean:true}],chartLayout('Messiness Score'),{displayModeBar:false,responsive:true});window.addEventListener('resize',resizeGraphs);}function resizeGraphs(){['summaryBar','conditionBar','messinessBar','moveDistBar','blankCardBar','messinessBoxBar'].forEach((id)=>{const el=document.getElementById(id);if(el)Plotly.Plots.resize(el);});}
const EMBED_MIN=520,EMBED_MAX=1800,HEIGHT_THRESHOLD=8;let lastSentHeight=0,heightTimer=null;
function postEmbedHeight(force=false){if(!embedMode||!window.parent||window.parent===window)return;const measured=Math.ceil(cardsContainer.getBoundingClientRect().height),clamped=Math.max(EMBED_MIN,Math.min(EMBED_MAX,measured));if(!force&&Math.abs(clamped-lastSentHeight)<=HEIGHT_THRESHOLD)return;lastSentHeight=clamped;window.parent.postMessage({type:'cards-embed-height',height:clamped},window.location.origin);}
function scheduleEmbedHeight(force=false){if(!embedMode)return;clearTimeout(heightTimer);heightTimer=setTimeout(()=>postEmbedHeight(force),120);}
function setupEmbedHeightObserver(){if(!embedMode||typeof ResizeObserver==='undefined')return;const observer=new ResizeObserver(()=>scheduleEmbedHeight(false));observer.observe(cardsContainer);window.addEventListener('load',()=>scheduleEmbedHeight(true));window.addEventListener('resize',()=>scheduleEmbedHeight(false));scheduleEmbedHeight(true);}
async function init(){try{const response=await fetch('/data/card_analysis_data.json',{ cache:'no-store' });dataset=await response.json();}catch(e){dataset={analysis_types:[],statistics:{}};}const rawTypes=Array.isArray(dataset.analysis_types)?dataset.analysis_types:[],byId={};rawTypes.forEach((a)=>{if(a&&Number.isInteger(a.id))byId[a.id]=a;});analysisTypes=[1,2,3,4,5,6,7,8,9].map((id)=>{const jsonAnalysis=byId[id]||{id,title:`Analysis ${id}`,trials:[]},def=analysisDefinitions[id]||{title:jsonAnalysis.title,explanation:''};return {...jsonAnalysis,...def,trials:Array.isArray(jsonAnalysis.trials)?jsonAnalysis.trials:[]};});renderStats(dataset.statistics||{});setupControls();initSelectors();rebuildTrialSelector();loadCurrentTrial();renderGraphs();setupEmbedHeightObserver();}
Object.assign(analysisDefinitions, {
    1: { title: 'Successful Clean Patterns (Many Moves)', explanation: 'Successful participants with many exploratory moves while keeping structure.' },
    2: { title: 'Failed Messy Patterns (Few Moves)', explanation: 'Failed trials where organization breaks down early.' },
    3: { title: 'All Successful Trials', explanation: 'All success outcomes to compare multiple winning paths.' },
    4: { title: 'In-Trial Progression (Early vs Late)', explanation: 'Compares how spatial organization changes from the start to the end of each trial.' },
    5: { title: 'Opening Strategies (First 5 Moves)', explanation: 'First moves that shape final outcomes.' },
    6: { title: 'Retry and Recovery Patterns', explanation: 'Highlights repeated participants when available, otherwise contrasts failed and successful strategies.' },
    7: { title: 'Extreme Cases (Cleanest vs Messiest)', explanation: 'Best and worst spatial organization cases.' },
    8: { title: 'Speed Comparison (Quick vs Slow Solvers)', explanation: 'Efficiency versus exploration in successful runs.' },
    9: { title: 'Card Repetition Patterns', explanation: 'Focused repetition versus broad exploration.' }
});

const MIN_VALID_MOVES = 6;

function normalizeTrialV2(trial) {
    const moves = Array.isArray(trial?.moves) ? trial.moves.filter((m) => Number.isInteger(m?.row) && Number.isInteger(m?.col)) : [];
    return {
        ...trial,
        moves,
        move_count: Number(trial?.move_count ?? moves.length) || moves.length,
        blank_card_count: Number(trial?.blank_card_count || 0)
    };
}

function trialIdKeyV2(trial) {
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

function dedupeTrialsV2(trials) {
    const map = new Map();
    trials.forEach((trial) => map.set(trialIdKeyV2(trial), trial));
    return Array.from(map.values());
}

function repeatParticipantsV2(trials) {
    const byP = new Map();
    trials.forEach((t) => {
        const p = String(t.participant || 'N/A');
        if (!byP.has(p)) byP.set(p, []);
        byP.get(p).push(t);
    });
    return Array.from(byP.entries()).filter(([, list]) => list.length > 1).sort((a, b) => b[1].length - a[1].length);
}

function messinessV2(trial) {
    if (typeof trial.messiness_score === 'number') return trial.messiness_score;
    const pts = trial.moves || [];
    if (!pts.length) return 0;
    const avgRow = avg(pts.map((m) => m.row));
    const avgCol = avg(pts.map((m) => m.col));
    return avg(pts.map((m) => Math.hypot(m.row - avgRow, m.col - avgCol)));
}

function repetitionRatioV2(trial) {
    const moves = trial.moves || [];
    if (!moves.length) return 0;
    const unique = new Set(moves.map((m) => `${m.value || ''}-${m.suit_symbol || ''}-${m.row}-${m.col}`)).size;
    return 1 - unique / moves.length;
}

function progressionDeltaV2(trial) {
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

function buildAnalysisDataV2(data) {
    const rawAnalyses = Array.isArray(data?.analysis_types) ? data.analysis_types : [];
    const allRaw = rawAnalyses.flatMap((a) => (Array.isArray(a.trials) ? a.trials : []).map((t) => normalizeTrialV2(t)));
    const nonEmptyRaw = allRaw.filter((t) => t.moves.length > 0);
    const nonEmpty = dedupeTrialsV2(nonEmptyRaw);
    const valid = nonEmpty.filter((t) => t.move_count >= MIN_VALID_MOVES);
    const success = valid.filter((t) => t.outcome === 'success');
    const fail = valid.filter((t) => t.outcome !== 'success');
    const repeated = repeatParticipantsV2(nonEmpty);
    const repeatedMixed = repeated.filter(([, list]) => {
        const outcomes = new Set(list.map((t) => t.outcome));
        return outcomes.has('success') && outcomes.has('fail');
    });

    const progressionFallback = [...valid]
        .sort((a, b) => Math.abs(progressionDeltaV2(b)) - Math.abs(progressionDeltaV2(a)))
        .slice(0, 16);

    const idToTrials = {
        1: success.filter((t) => t.move_count >= 15).slice(0, 24),
        2: fail.filter((t) => t.move_count < 15).slice(0, 24),
        3: success.slice(0, 32),
        4: repeated.length ? repeated.slice(0, 12).flatMap(([, list]) => list.sort((a, b) => a.move_count - b.move_count)) : progressionFallback,
        5: valid.filter((t) => t.moves.length >= 5).slice(0, 32).map((t) => ({ ...t, moves: t.moves.slice(0, 5), move_count: 5 })),
        6: repeatedMixed.length ? repeatedMixed.slice(0, 16).flatMap(([, list]) => list.sort((a, b) => a.move_count - b.move_count)) : [...fail.slice(0, 10), ...success.slice(0, 10)],
        7: (() => {
            const sorted = [...valid].sort((a, b) => messinessV2(a) - messinessV2(b));
            return [...sorted.slice(0, 6), ...sorted.slice(-6)];
        })(),
        8: (() => {
            const sorted = [...success].sort((a, b) => a.move_count - b.move_count);
            return [...sorted.slice(0, 8), ...sorted.slice(-8)];
        })(),
        9: (() => {
            const sorted = [...valid].sort((a, b) => repetitionRatioV2(b) - repetitionRatioV2(a));
            return [...sorted.slice(0, 8), ...sorted.slice(-8)];
        })()
    };

    const byId = {};
    rawAnalyses.forEach((a) => { byId[a.id] = a; });
    return [1, 2, 3, 4, 5, 6, 7, 8, 9].map((id) => {
        const base = byId[id] || { id, title: `Analysis ${id}`, trials: [] };
        const derived = idToTrials[id] || [];
        const fallback = (base.trials || []).map((t) => normalizeTrialV2(t)).filter((t) => t.moves.length > 0);
        return {
            ...base,
            ...(analysisDefinitions[id] || {}),
            trials: derived.length ? dedupeTrialsV2(derived) : dedupeTrialsV2(fallback)
        };
    });
}

function getUniqueTrials() {
    const all = analysisTypes.flatMap((analysis) => analysis.trials || []);
    const map = new Map();
    all.forEach((trial) => {
        const normalized = normalizeTrialV2(trial);
        if (normalized.moves.length > 0) {
            map.set(trialIdKeyV2(normalized), normalized);
        }
    });
    return Array.from(map.values());
}

async function init() {
    try {
        const response = await fetch('/data/card_analysis_data.json', { cache: 'no-store' });
        dataset = await response.json();
    } catch (e) {
        dataset = { analysis_types: [], statistics: {} };
    }
    analysisTypes = buildAnalysisDataV2(dataset);
    currentAnalysisIdx = 0;
    currentTrialIdx = 0;
    currentMove = 0;
    showingFinalState = false;
    renderStats(dataset.statistics || {});
    setupControls();
    initSelectors();
    rebuildTrialSelector();
    loadCurrentTrial();
    renderGraphs();
    setupEmbedHeightObserver();
}

init();

