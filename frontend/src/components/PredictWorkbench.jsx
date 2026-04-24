import React, { useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { getPrediction, getPredictionFromPdf } from '../api';
import ResultCard from './ResultCard';
import KnowledgeLayerCard from './KnowledgeLayerCard';
import GraphView from './GraphView';
import './PredictWorkbench.css';

const PredictWorkbench = () => {
  const [mode, setMode] = useState('manual');
  const [manualInput, setManualInput] = useState('');
  const [pdfFile, setPdfFile] = useState(null);
  const [structured, setStructured] = useState({
    age: '',
    amh: '',
    fsh: '',
    bmi: '',
    endometrial_thickness: '',
    embryo_grade: '',
    embryos_created: '',
    total_eggs: '',
  });
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const onManualSubmit = async (e) => {
    e.preventDefault();
    if (!manualInput.trim()) return;

    setLoading(true);
    setError('');
    try {
      const response = await getPrediction(manualInput.trim());
      setResult(response);
    } catch (err) {
      setError(err.message || 'Prediction request failed');
    } finally {
      setLoading(false);
    }
  };

  const onStructuredSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const payload = {};
      Object.entries(structured).forEach(([k, v]) => {
        if (v !== '') payload[k] = Number.isNaN(Number(v)) ? v : Number(v);
      });
      const response = await getPrediction(payload);
      setResult(response);
    } catch (err) {
      setError(err.message || 'Prediction request failed');
    } finally {
      setLoading(false);
    }
  };

  const onPdfSubmit = async (e) => {
    e.preventDefault();
    if (!pdfFile) return;
    setLoading(true);
    setError('');
    try {
      const response = await getPredictionFromPdf(pdfFile);
      setResult(response);
    } catch (err) {
      setError(err.message || 'PDF prediction failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="predict-workbench" id="predict">
      <div className="predict-workbench__orb predict-workbench__orb--1" aria-hidden />
      <div className="predict-workbench__orb predict-workbench__orb--2" aria-hidden />
      <div className="container predict-workbench__container">
        <div className="predict-workbench__left">
          <div className="section-label">Clinical Predictor</div>
          <h2>Predict IVF outcomes with Progena AI</h2>
          <p>
            Submit a patient note and receive success probability, confidence, key drivers,
            and clinically structured explanation in seconds.
          </p>

          <div className="predict-workbench__tabs">
            <button className={mode === 'manual' ? 'active' : ''} onClick={() => setMode('manual')}>Manual Input</button>
            <button className={mode === 'columns' ? 'active' : ''} onClick={() => setMode('columns')}>Column Input</button>
            <button className={mode === 'pdf' ? 'active' : ''} onClick={() => setMode('pdf')}>PDF Upload</button>
          </div>

          {mode === 'manual' && (
            <form onSubmit={onManualSubmit} className="predict-workbench__form">
              <textarea
                value={manualInput}
                onChange={(e) => setManualInput(e.target.value)}
                placeholder="Example: 32 year old, AMH 2.4, FSH 8, 12 embryos created, 2 transferred..."
                rows={10}
              />
              <button type="submit" className="btn-primary" disabled={loading}>
                {loading ? 'Predicting...' : 'Run Prediction'} <ArrowRight size={16} />
              </button>
            </form>
          )}

          {mode === 'columns' && (
            <form onSubmit={onStructuredSubmit} className="predict-workbench__form predict-workbench__grid-form">
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
              <button type="submit" className="btn-primary" disabled={loading}>
                {loading ? 'Predicting...' : 'Run Prediction'} <ArrowRight size={16} />
              </button>
            </form>
          )}

          {mode === 'pdf' && (
            <form onSubmit={onPdfSubmit} className="predict-workbench__form">
              <input
                type="file"
                accept=".pdf,.txt"
                onChange={(e) => setPdfFile(e.target.files?.[0] || null)}
              />
              <button type="submit" className="btn-primary" disabled={loading || !pdfFile}>
                {loading ? 'Predicting...' : 'Upload & Predict'} <ArrowRight size={16} />
              </button>
            </form>
          )}

          {loading && <div className="predict-workbench__status">Analyzing clinical inputs...</div>}
          {error && <div className="predict-workbench__error">{error}</div>}
        </div>

        <div className="predict-workbench__right">
          <ResultCard result={result} loading={loading} />
          <div className="predict-workbench__knowledge-row">
            <KnowledgeLayerCard result={result} loading={loading} />
            <GraphView
              graphData={result?.graph}
              riskPaths={result?.risk_paths}
              criticalPath={result?.critical_path}
              explanation={result?.explanation}
            />
          </div>
        </div>
      </div>
    </section>
  );
};

export default PredictWorkbench;
