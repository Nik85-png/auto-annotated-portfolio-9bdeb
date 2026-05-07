(function () {
  const form = document.getElementById('risk-form');
  const resetBtn = document.getElementById('reset-form');
  const statusText = document.getElementById('status-text');
  const predictionGrid = document.getElementById('prediction-grid');
  const positiveList = document.getElementById('positive-list');
  const negativeList = document.getElementById('negative-list');
  const absoluteList = document.getElementById('absolute-list');

  function toPayload(formData) {
    const payload = {};
    for (const [key, value] of formData.entries()) {
      if (value === 'true' || value === 'false') {
        payload[key] = value === 'true';
      } else if (value !== '' && !Number.isNaN(Number(value)) && form.elements[key].type === 'number') {
        payload[key] = Number(value);
      } else {
        payload[key] = value;
      }
    }
    return payload;
  }

  function renderPredictions(rows) {
    predictionGrid.innerHTML = rows.map((row) => {
      const width = Math.max(1, Math.min(100, row.percent));
      return `
        <article class="prediction-item">
          <header>
            <div>
              <h3>${row.label}</h3>
              <div class="meta">${row.model_name} ? internal AUROC ${Number(row.internal_auc).toFixed(3)}</div>
            </div>
            <div class="metric">${row.percent.toFixed(1)}%</div>
          </header>
          <div class="risk-track"><i style="width:${width}%"></i></div>
        </article>
      `;
    }).join('');
  }

  function contributionItem(item, klass) {
    const sign = item.shap_value >= 0 ? '+' : '?';
    return `
      <li>
        <strong>${item.feature}</strong>
        <small>Current value: ${formatValue(item.value)}</small>
        <span class="contrib-pill ${klass}">${sign}${Math.abs(item.shap_value).toFixed(3)} SHAP</span>
      </li>
    `;
  }

  function formatValue(value) {
    if (Number.isInteger(value)) return String(value);
    if (Math.abs(value) >= 100) return value.toFixed(1);
    if (Math.abs(value) >= 1) return value.toFixed(2);
    return value.toFixed(3);
  }

  function renderShap(shap) {
    positiveList.innerHTML = shap.top_positive.map((item) => contributionItem(item, 'up')).join('') || '<li><strong>No strong positive contributors</strong></li>';
    negativeList.innerHTML = shap.top_negative.map((item) => contributionItem(item, 'down')).join('') || '<li><strong>No strong protective contributors</strong></li>';
    const maxAbs = Math.max(...shap.top_absolute.map((item) => Math.abs(item.shap_value)), 1);
    absoluteList.innerHTML = shap.top_absolute.map((item) => {
      const width = Math.max(8, (Math.abs(item.shap_value) / maxAbs) * 100);
      const klass = item.shap_value >= 0 ? 'up' : 'down';
      const sign = item.shap_value >= 0 ? '+' : '?';
      return `
        <div class="waterfall-item">
          <strong>${item.feature}</strong>
          <small>Value ${formatValue(item.value)} ? ${sign}${Math.abs(item.shap_value).toFixed(3)} SHAP</small>
          <div class="waterfall-bar"><i class="${klass}" style="width:${width}%"></i></div>
        </div>
      `;
    }).join('');
  }

  async function submitForm() {
    statusText.textContent = 'Running live prediction?';
    const payload = toPayload(new FormData(form));
    const response = await fetch('/api/predict', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error('Prediction request failed.');
    }

    const data = await response.json();
    renderPredictions(data.predictions);
    renderShap(data.shap);
    statusText.textContent = 'Updated using the live leakage-clean models.';
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      await submitForm();
    } catch (error) {
      statusText.textContent = 'The live prediction service failed to respond.';
      predictionGrid.innerHTML = '<article class="prediction-item"><h3>Service unavailable</h3><div class="meta">Check the Render deployment or try the full-page tool.</div></article>';
    }
  });

  resetBtn.addEventListener('click', () => {
    setTimeout(() => form.dispatchEvent(new Event('submit', { cancelable: true })), 0);
  });

  form.dispatchEvent(new Event('submit', { cancelable: true }));
})();
