import React, { useMemo, useState } from 'react';
import {
  Activity,
  ArrowLeft,
  ArrowRight,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  FileText,
  HeartPulse,
  Image as ImageIcon,
  LockKeyhole,
  Pill,
  ShieldCheck,
  Sparkles,
  Stethoscope,
  Upload,
  UserRound,
  UsersRound,
} from 'lucide-react';
import GraphView from './components/GraphView';
import ResultCard from './components/ResultCard';
import { getPrediction, getPredictionFromImage, getPredictionFromPdf } from './api';
import './App.css';

const doctorPhoto = '/@fs/Users/btchinmayi/Projects/IVF/photos/fc318abcf86258657fabc1c8d97f61d7.jpg';

const fieldLabels = {
  age: 'Age',
  amh: 'AMH',
  fsh: 'FSH',
  bmi: 'BMI',
  endometrial_thickness: 'Endometrial thickness',
  embryo_grade: 'Embryo grade',
  embryos_created: 'Embryos created',
  total_eggs: 'Total eggs',
};

const initialStructured = {
  age: '',
  amh: '',
  fsh: '',
  bmi: '',
  endometrial_thickness: '',
  embryo_grade: '',
  embryos_created: '',
  total_eggs: '',
};

const patientRoster = [
  { id: 'P-1042', name: 'Ananya Rao', age: 32, stage: 'Stimulation day 7', risk: 'Moderate', next: 'Follicle scan' },
  { id: 'P-1188', name: 'Meera Shah', age: 36, stage: 'Embryo review', risk: 'Elevated', next: 'Counseling call' },
  { id: 'P-1214', name: 'Priya Nair', age: 29, stage: 'Transfer prep', risk: 'Low', next: 'Endometrium review' },
];

const treatmentSteps = [
  'Baseline review',
  'Stimulation tracking',
  'Trigger planning',
  'Retrieval',
  'Embryo assessment',
  'Transfer readiness',
];

const doctorSections = [
  { id: 'manual', label: 'Manual IVF Prediction', icon: ClipboardList },
  { id: 'clinical', label: 'Clinical Fields', icon: BarChart3 },
  { id: 'report', label: 'Report Prediction', icon: FileText },
  { id: 'image', label: 'Image Classification', icon: ImageIcon },
  { id: 'tracker', label: 'Treatment Tracking', icon: CalendarDays },
  { id: 'recommendation', label: 'Diet + Med Recommendations', icon: Pill },
  { id: 'history', label: 'Patient Details + History', icon: UsersRound },
];

const patientSections = [
  { id: 'output', label: 'IVF Output Prediction', icon: HeartPulse },
  { id: 'analysis', label: 'Report Analysis', icon: FileText },
  { id: 'tracker', label: 'Tracker Calendar', icon: CalendarDays },
  { id: 'recommendation', label: 'Diet + Med Recommendations', icon: Pill },
  { id: 'visualization', label: '3D Visualization', icon: Sparkles },
  { id: 'doctor', label: 'Connect to Doctor', icon: Stethoscope },
];

const starterRecommendation = [
  'Maintain a protein-forward meal pattern with iron-rich foods and hydration targets.',
  'Continue prescribed fertility medications exactly as reviewed by the care team.',
  'Prioritize sleep consistency and avoid new supplements until the clinician approves them.',
];

function App() {
  const [view, setView] = useState('landing');
  const [loginRole, setLoginRole] = useState('doctor');
  const [activePatientId, setActivePatientId] = useState(patientRoster[0].id);
  const [mode, setMode] = useState('manual');
  const [doctorSection, setDoctorSection] = useState('manual');
  const [patientSection, setPatientSection] = useState('output');
  const [manualInput, setManualInput] = useState('');
  const [pdfFile, setPdfFile] = useState(null);
  const [imageFile, setImageFile] = useState(null);
  const [structured, setStructured] = useState(initialStructured);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [validatedRecommendation, setValidatedRecommendation] = useState(false);
  const [trackingDone, setTrackingDone] = useState(3);

  const activePatient = patientRoster.find((patient) => patient.id === activePatientId) || patientRoster[0];
  const probability = typeof result?.probability === 'number' ? Math.round(result.probability * 100) : null;

  const recommendations = useMemo(() => {
    const negativeFactors = result?.explanation?.negative_factors || [];
    const generated = negativeFactors.flatMap((factor) => {
      if (typeof factor === 'string') return [`Discuss ${factor.toLowerCase()} with the care team.`];
      const improve = factor?.how_to_improve || {};
      return [
        ...(improve.short_term || []),
        ...(improve.before_next_cycle || []),
        ...(improve.clinical_options || []),
      ];
    });
    return generated.length ? generated.slice(0, 5) : starterRecommendation;
  }, [result]);

  const openLogin = (role) => {
    setLoginRole(role);
    setView('login');
  };

  const runPrediction = async () => {
    setLoading(true);
    setError('');
    try {
      if (mode === 'manual') {
        if (!manualInput.trim()) {
          setError('Please enter patient details before running analysis.');
          return;
        }
        setResult(await getPrediction(manualInput.trim()));
      } else if (mode === 'columns') {
        const payload = {};
        Object.entries(structured).forEach(([key, value]) => {
          if (value !== '') payload[key] = Number.isNaN(Number(value)) ? value : Number(value);
        });
        if (Object.keys(payload).length === 0) {
          setError('Please fill at least one clinical field.');
          return;
        }
        setResult(await getPrediction(payload));
      } else if (mode === 'pdf') {
        if (!pdfFile) {
          setError('Please select a report PDF or text file.');
          return;
        }
        setResult(await getPredictionFromPdf(pdfFile));
      } else if (mode === 'image') {
        if (!imageFile) {
          setError('Please upload an image for classification.');
          return;
        }
        setResult(await getPredictionFromImage(imageFile));
      }
      setValidatedRecommendation(false);
    } catch (err) {
      setError(err.message || 'Prediction request failed.');
    } finally {
      setLoading(false);
    }
  };

  if (view === 'login') {
    return (
      <LoginPage
        role={loginRole}
        onBack={() => setView('landing')}
        onLogin={() => {
          setView(loginRole);
          if (loginRole === 'doctor') setDoctorSection('manual');
          else setPatientSection('output');
        }}
        onSwitchRole={() => setLoginRole((role) => (role === 'doctor' ? 'patient' : 'doctor'))}
      />
    );
  }

  if (view === 'doctor' || view === 'patient') {
    return (
      <HospitalDashboard
        role={view}
        activePatient={activePatient}
        activePatientId={activePatientId}
        doctorSection={doctorSection}
        patientSection={patientSection}
        error={error}
        imageFile={imageFile}
        loading={loading}
        manualInput={manualInput}
        mode={mode}
        pdfFile={pdfFile}
        probability={probability}
        recommendations={recommendations}
        result={result}
        setActivePatientId={setActivePatientId}
        setDoctorSection={setDoctorSection}
        setPatientSection={setPatientSection}
        setImageFile={setImageFile}
        setManualInput={setManualInput}
        setMode={setMode}
        setPdfFile={setPdfFile}
        setStructured={setStructured}
        setTrackingDone={setTrackingDone}
        setValidatedRecommendation={setValidatedRecommendation}
        structured={structured}
        trackingDone={trackingDone}
        validatedRecommendation={validatedRecommendation}
        onBack={() => setView('landing')}
        onRunPrediction={runPrediction}
      />
    );
  }

  return <LandingPage onDoctor={() => openLogin('doctor')} onPatient={() => openLogin('patient')} />;
}

function LandingPage({ onDoctor, onPatient }) {
  return (
    <main className="landing-root">
      <nav className="landing-nav">
        <div className="logo-lockup">
          <HeartPulse size={24} />
          <strong>Progena IVF</strong>
        </div>
        <div className="landing-nav-actions">
          <a href="#about">About</a>
          <a href="#services">Services</a>
          <button type="button" className="btn-outline" onClick={onDoctor}>Login</button>
        </div>
      </nav>

      <section className="landing-hero">
        <div className="hero-copy">
          <span className="tag">Precision fertility platform</span>
          <h1>Clinical IVF intelligence designed for doctors and patients.</h1>
          <p>
            Upload notes, reports, and images to generate IVF predictions, treatment pathways,
            and doctor-validated recommendations in one focused workspace.
          </p>
          <div className="role-cards">
            <button className="role-card" type="button" onClick={onDoctor}>
              <Stethoscope size={22} />
              <div>
                <strong>Doctor View</strong>
                <small>Prediction controls, validation workflow, patient records</small>
              </div>
              <ArrowRight size={16} />
            </button>
            <button className="role-card" type="button" onClick={onPatient}>
              <UserRound size={22} />
              <div>
                <strong>Patient View</strong>
                <small>Reports, tracking calendar, recommendations, doctor contact</small>
              </div>
              <ArrowRight size={16} />
            </button>
          </div>
        </div>
        <div className="hero-photo-wrap">
          <img src={doctorPhoto} alt="Doctor preparing sterile gloves" />
        </div>
      </section>

      <section className="landing-section" id="about">
        <h2>Built for end-to-end IVF decision support</h2>
        <p>
          The platform unifies manual input prediction, clinical-field prediction, report analysis,
          image classification, treatment tracking, 3D visualization, and recommendation validation.
        </p>
      </section>

      <section className="landing-services" id="services">
        <ServiceTile icon={ClipboardList} title="Manual IVF Prediction" text="Capture detailed notes and run structured reasoning." />
        <ServiceTile icon={BarChart3} title="Clinical Fields" text="Submit numeric and clinical fields directly to prediction." />
        <ServiceTile icon={FileText} title="Report Prediction" text="Upload reports and extract probability with explanation." />
        <ServiceTile icon={ImageIcon} title="Image Classification" text="Classify uploaded images with confidence and explanation." />
      </section>

      <footer className="landing-footer">
        <div>
          <strong>Progena IVF</strong>
          <p>AI-assisted clinical fertility workflow for doctors and patients.</p>
        </div>
        <div>
          <strong>Quick Links</strong>
          <p>About · Services · Login · Support</p>
        </div>
        <div>
          <strong>Contact</strong>
          <p>support@progena.ai · +91 90000 00000</p>
        </div>
      </footer>
    </main>
  );
}

function LoginPage({ role, onBack, onLogin, onSwitchRole }) {
  return (
    <main className="login-root">
      <section className="login-card">
        <button type="button" className="btn-back" onClick={onBack}><ArrowLeft size={15} /> Back to Home</button>
        <div className="login-grid">
          <div className="login-copy">
            <span className="tag">{role === 'doctor' ? 'Doctor Access' : 'Patient Access'}</span>
            <h1>{role === 'doctor' ? 'Secure doctor dashboard login' : 'Secure patient dashboard login'}</h1>
            <p>
              {role === 'doctor'
                ? 'Access manual prediction, report analysis, image classification, tracking, and recommendation validation.'
                : 'Track appointments, view prediction output, and review doctor-approved guidance.'}
            </p>
            <label>
              Email
              <input value={role === 'doctor' ? 'doctor@progena.ai' : 'patient@progena.ai'} readOnly />
            </label>
            <label>
              Password
              <input value="progenaivf" type="password" readOnly />
            </label>
            <div className="login-actions">
              <button className="btn-primary" type="button" onClick={onLogin}>Login</button>
              <button className="btn-outline" type="button" onClick={onSwitchRole}>
                Switch to {role === 'doctor' ? 'Patient' : 'Doctor'}
              </button>
            </div>
          </div>
          <div className="login-photo-wrap">
            <img src={doctorPhoto} alt="Clinical team visual" />
          </div>
        </div>
      </section>
    </main>
  );
}

function HospitalDashboard(props) {
  const {
    role,
    activePatient,
    activePatientId,
    doctorSection,
    patientSection,
    error,
    imageFile,
    loading,
    manualInput,
    mode,
    pdfFile,
    probability,
    recommendations,
    result,
    setActivePatientId,
    setDoctorSection,
    setPatientSection,
    setImageFile,
    setManualInput,
    setMode,
    setPdfFile,
    setStructured,
    setTrackingDone,
    setValidatedRecommendation,
    structured,
    trackingDone,
    validatedRecommendation,
    onBack,
    onRunPrediction,
  } = props;

  const isDoctor = role === 'doctor';
  const sectionItems = isDoctor ? doctorSections : patientSections;
  const activeSection = isDoctor ? doctorSection : patientSection;

  return (
    <main className="dash-root">
      <aside className="sidebar">
        <div className="logo-lockup">
          <HeartPulse size={22} />
          <strong>Progena IVF</strong>
        </div>
        <div className="sidebar-list">
          {sectionItems.map((item) => (
            <button
              key={item.id}
              className={`sidebar-item ${activeSection === item.id ? 'active' : ''}`}
              type="button"
              onClick={() => {
                if (isDoctor) setDoctorSection(item.id);
                else setPatientSection(item.id);
                if (item.id === 'manual') setMode('manual');
                if (item.id === 'clinical') setMode('columns');
                if (item.id === 'report') setMode('pdf');
                if (item.id === 'image') setMode('image');
              }}
            >
              <item.icon size={17} />
              <span>{item.label}</span>
            </button>
          ))}
        </div>
        <button className="btn-outline" type="button" onClick={onBack}>Back to Landing</button>
      </aside>

      <section className="dash-content">
        <header className="dash-header">
          <div>
            <span className="tag">{isDoctor ? 'Doctor Dashboard' : 'Patient Dashboard'}</span>
            <h2>{isDoctor ? 'Clinical workflow control center' : `Welcome, ${activePatient.name}`}</h2>
          </div>
          <div className="header-photo">
            <img src={doctorPhoto} alt="Clinical context" />
          </div>
        </header>

        {isDoctor ? (
          <DoctorSectionView
            activeSection={activeSection}
            activePatient={activePatient}
            activePatientId={activePatientId}
            error={error}
            imageFile={imageFile}
            loading={loading}
            manualInput={manualInput}
            mode={mode}
            pdfFile={pdfFile}
            probability={probability}
            result={result}
            setActivePatientId={setActivePatientId}
            setImageFile={setImageFile}
            setManualInput={setManualInput}
            setMode={setMode}
            setPdfFile={setPdfFile}
            setStructured={setStructured}
            setTrackingDone={setTrackingDone}
            setValidatedRecommendation={setValidatedRecommendation}
            structured={structured}
            trackingDone={trackingDone}
            validatedRecommendation={validatedRecommendation}
            onRunPrediction={onRunPrediction}
          />
        ) : (
          <PatientSectionView
            activeSection={activeSection}
            activePatient={activePatient}
            probability={probability}
            recommendations={recommendations}
            result={result}
            trackingDone={trackingDone}
            validatedRecommendation={validatedRecommendation}
          />
        )}
      </section>
    </main>
  );
}

function DoctorSectionView(props) {
  const {
    activeSection,
    activePatient,
    activePatientId,
    error,
    imageFile,
    loading,
    manualInput,
    mode,
    pdfFile,
    probability,
    result,
    setActivePatientId,
    setImageFile,
    setManualInput,
    setMode,
    setPdfFile,
    setStructured,
    setTrackingDone,
    setValidatedRecommendation,
    structured,
    trackingDone,
    validatedRecommendation,
    onRunPrediction,
  } = props;

  if (['manual', 'clinical', 'report', 'image'].includes(activeSection)) {
    return (
      <div className="dash-grid">
        <section className="panel">
          <h3>Patient List</h3>
          {patientRoster.map((patient) => (
            <button
              className={`patient-chip ${patient.id === activePatientId ? 'active' : ''}`}
              key={patient.id}
              type="button"
              onClick={() => setActivePatientId(patient.id)}
            >
              <strong>{patient.name}</strong>
              <small>{patient.id} · Age {patient.age} · {patient.stage}</small>
            </button>
          ))}
        </section>
        <InputWorkspace
          error={error}
          imageFile={imageFile}
          loading={loading}
          manualInput={manualInput}
          mode={mode}
          pdfFile={pdfFile}
          setImageFile={setImageFile}
          setManualInput={setManualInput}
          setMode={setMode}
          setPdfFile={setPdfFile}
          setStructured={setStructured}
          structured={structured}
          onRunPrediction={onRunPrediction}
        />
        <ResultCard result={result} loading={loading} />
        <section className="panel">
          <h3>Prediction Snapshot</h3>
          <p>Active patient: {activePatient.name}</p>
          <p>Probability: {probability ? `${probability}%` : 'Pending'}</p>
          <p>Section: {activeSection}</p>
        </section>
      </div>
    );
  }

  if (activeSection === 'tracker') {
    return <TrackingPanel trackingDone={trackingDone} setTrackingDone={setTrackingDone} />;
  }

  if (activeSection === 'recommendation') {
    return (
      <div className="dash-grid">
        <ValidationPanel result={result} validatedRecommendation={validatedRecommendation} setValidatedRecommendation={setValidatedRecommendation} />
        <PatientRecommendation validated={validatedRecommendation} recommendations={result ? (result.explanation?.key_drivers || []) : starterRecommendation} />
      </div>
    );
  }

  return <PatientHistoryCard activePatient={activePatient} />;
}

function PatientSectionView({ activeSection, activePatient, probability, recommendations, result, trackingDone, validatedRecommendation }) {
  if (activeSection === 'output') {
    return (
      <div className="dash-grid">
        <ResultCard result={result} loading={false} />
        <section className="panel">
          <h3>IVF Output Prediction</h3>
          <p>Patient: {activePatient.name}</p>
          <p>Cycle status: {activePatient.stage}</p>
          <p>Prediction confidence: {probability ? `${probability}%` : 'Awaiting doctor analysis'}</p>
        </section>
      </div>
    );
  }

  if (activeSection === 'analysis') return <ReportViewer result={result} />;
  if (activeSection === 'tracker') return <TreatmentTimeline done={trackingDone} />;
  if (activeSection === 'recommendation') return <PatientRecommendation validated={validatedRecommendation} recommendations={recommendations} />;
  if (activeSection === 'visualization') return <ClinicalVisualization result={result} probability={probability} />;
  return <ConnectDoctorCard />;
}

function InputWorkspace(props) {
  const {
    error,
    imageFile,
    loading,
    manualInput,
    mode,
    pdfFile,
    setImageFile,
    setManualInput,
    setMode,
    setPdfFile,
    setStructured,
    structured,
    onRunPrediction,
  } = props;

  const modes = [
    ['manual', 'Manual', ClipboardList],
    ['columns', 'Clinical fields', BarChart3],
    ['pdf', 'Report prediction', FileText],
    ['image', 'Image classification', ImageIcon],
  ];

  return (
    <section className="panel">
      <h3>Prediction Input Workspace</h3>
      <div className="tabs">
        {modes.map(([key, label, Icon]) => (
          <button className={mode === key ? 'active' : ''} key={key} type="button" onClick={() => setMode(key)}>
            <Icon size={14} /> {label}
          </button>
        ))}
      </div>

      {mode === 'manual' && (
        <textarea
          value={manualInput}
          onChange={(event) => setManualInput(event.target.value)}
          placeholder="Enter IVF history, AMH, FSH, BMI, embryo quality, retrieval details, transfer notes..."
          rows={7}
        />
      )}

      {mode === 'columns' && (
        <div className="field-grid">
          {Object.keys(structured).map((key) => (
            <label key={key}>
              <span>{fieldLabels[key]}</span>
              <input
                value={structured[key]}
                onChange={(event) => setStructured((previous) => ({ ...previous, [key]: event.target.value }))}
                placeholder={fieldLabels[key]}
              />
            </label>
          ))}
        </div>
      )}

      {mode === 'pdf' && <FileDrop accept=".pdf,.txt" file={pdfFile} icon={FileText} label="Upload PDF or text report" onChange={setPdfFile} />}
      {mode === 'image' && <FileDrop accept="image/*" file={imageFile} icon={ImageIcon} label="Upload scan, lab snapshot, or treatment image" onChange={setImageFile} />}

      <div className="input-actions">
        <button className="btn-primary" type="button" onClick={onRunPrediction} disabled={loading}>
          {loading ? 'Analysing...' : 'Run Analysis'} <ArrowRight size={14} />
        </button>
        {error ? <p className="error">{error}</p> : <p>Prediction uses existing backend APIs and schema.</p>}
      </div>
    </section>
  );
}

function FileDrop({ accept, file, icon: Icon, label, onChange }) {
  return (
    <label className="file-drop">
      <Upload size={20} />
      <Icon size={24} />
      <strong>{label}</strong>
      <small>{file ? file.name : 'Choose a file to attach'}</small>
      <input type="file" accept={accept} onChange={(event) => onChange(event.target.files?.[0] || null)} />
    </label>
  );
}

function TrackingPanel({ trackingDone, setTrackingDone }) {
  return (
    <section className="panel">
      <h3>Treatment Tracking Calendar</h3>
      <div className="timeline">
        {treatmentSteps.map((step, index) => (
          <button className={index < trackingDone ? 'done' : ''} key={step} type="button" onClick={() => setTrackingDone(index + 1)}>
            <CheckCircle2 size={16} /> {step}
          </button>
        ))}
      </div>
    </section>
  );
}

function ValidationPanel({ result, validatedRecommendation, setValidatedRecommendation }) {
  return (
    <section className="panel">
      <h3>Doctor Validation</h3>
      <p>Diet and medication recommendations are generated by the model and released only after doctor validation.</p>
      <button
        className={validatedRecommendation ? 'btn-outline' : 'btn-primary'}
        type="button"
        disabled={!result}
        onClick={() => setValidatedRecommendation((value) => !value)}
      >
        {validatedRecommendation ? 'Validated for patient view' : 'Validate Recommendations'}
      </button>
    </section>
  );
}

function PatientRecommendation({ validated, recommendations }) {
  return (
    <section className="panel">
      <h3>Diet and Med Recommendations</h3>
      {validated ? (
        <ul className="recommendations">
          {recommendations.map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}
        </ul>
      ) : (
        <div className="locked">
          <LockKeyhole size={24} />
          <p>Waiting for doctor validation.</p>
        </div>
      )}
    </section>
  );
}

function ReportViewer({ result }) {
  return (
    <section className="panel">
      <h3>Report Analysis</h3>
      <p>{result?.explanation?.summary || 'Your analysed report will appear after doctor review.'}</p>
      <GraphView graphData={result?.graph} riskPaths={result?.risk_paths} criticalPath={result?.critical_path} explanation={result?.explanation} />
    </section>
  );
}

function TreatmentTimeline({ done }) {
  return (
    <section className="panel">
      <h3>Tracker Calendar</h3>
      <div className="timeline readonly">
        {treatmentSteps.map((step, index) => (
          <div className={index < done ? 'done' : ''} key={step}>
            <CheckCircle2 size={16} /> {step}
          </div>
        ))}
      </div>
    </section>
  );
}

function ClinicalVisualization({ probability, result }) {
  return (
    <section className="panel">
      <h3>3D Visualization</h3>
      <div className="viz-core">{probability ? `${probability}%` : 'AI'}</div>
      <p>{result ? 'Readiness is mapped from prediction and risk pathways.' : 'Run an analysis for visualization context.'}</p>
    </section>
  );
}

function PatientHistoryCard({ activePatient }) {
  return (
    <section className="panel">
      <h3>Patient Details and Medical History</h3>
      <p>Name: {activePatient.name}</p>
      <p>Patient ID: {activePatient.id}</p>
      <p>Age: {activePatient.age}</p>
      <p>Current stage: {activePatient.stage}</p>
      <p>Risk status: {activePatient.risk}</p>
      <p>Medication history: hormonal stimulation protocol under monitoring.</p>
    </section>
  );
}

function ConnectDoctorCard() {
  return (
    <section className="panel">
      <h3>Connect to Doctor</h3>
      <p>Dr. Neri Kwang · Fertility Specialist</p>
      <p>Availability: Mon-Sat · 10:00 AM to 5:00 PM</p>
      <p>Next appointment sync is shown in your tracker calendar after doctor updates.</p>
      <button className="btn-primary" type="button">Request Consultation</button>
    </section>
  );
}

function ServiceTile({ icon: Icon, title, text }) {
  return (
    <article className="service-tile">
      <Icon size={20} />
      <h3>{title}</h3>
      <p>{text}</p>
    </article>
  );
}

export default App;
