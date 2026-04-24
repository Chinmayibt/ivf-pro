import React from 'react';

function InputPanel({
  mode,
  setMode,
  manualInput,
  setManualInput,
  structured,
  setStructured,
  pdfFile,
  setPdfFile,
  onRunPrediction,
  loading,
  error,
}) {
  return (
    <div className="card">
      <div className="tabs">
        <button className={mode === 'manual' ? 'active' : ''} onClick={() => setMode('manual')} type="button">Manual</button>
        <button className={mode === 'column' ? 'active' : ''} onClick={() => setMode('column')} type="button">Column</button>
        <button className={mode === 'pdf' ? 'active' : ''} onClick={() => setMode('pdf')} type="button">PDF</button>
      </div>

      {mode === 'manual' && (
        <textarea
          value={manualInput}
          onChange={(e) => setManualInput(e.target.value)}
          placeholder="Enter patient details..."
          rows={5}
        />
      )}

      {mode === 'column' && (
        <div className="column-grid">
          {Object.keys(structured).map((key) => (
            <label key={key}>
              <span>{key}</span>
              <input
                value={structured[key]}
                onChange={(e) => setStructured((prev) => ({ ...prev, [key]: e.target.value }))}
                placeholder={key}
              />
            </label>
          ))}
        </div>
      )}

      {mode === 'pdf' && (
        <input
          type="file"
          accept=".pdf,.txt"
          onChange={(e) => setPdfFile(e.target.files?.[0] || null)}
        />
      )}

      <button className="btn-primary run-btn" type="button" onClick={onRunPrediction} disabled={loading}>
        {loading ? 'Running...' : 'Run Prediction'}
      </button>

      {mode === 'pdf' && pdfFile ? <p className="status">Selected: {pdfFile.name}</p> : null}
      {error ? <p className="error">{error}</p> : null}
    </div>
  );
}

export default InputPanel;
