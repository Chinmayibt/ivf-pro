import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
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
import Button from './components/ui/Button';
import {
  createAppointment,
  getAppointments,
  getLoginExampleEmail,
  getNotifications,
  getPrediction,
  getPredictionFromImage,
  getPredictionFromPdf,
  loginDemo,
  markNotificationRead,
} from './api';
import './App.css';
import heroScrubsImage from '../../photos/image.png';
import loginStethoscopeImage from '../../photos/image1.png';

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
  { id: 'input_hub', label: 'Prediction Inputs', icon: ClipboardList },
  { id: 'prediction_result', label: 'Prediction Result', icon: BarChart3 },
  { id: 'knowledge_graph', label: 'Knowledge Graph', icon: Activity },
  { id: 'tracker', label: 'Treatment Tracking', icon: CalendarDays },
  { id: 'recommendation', label: 'Diet + Med Recommendations', icon: Pill },
  { id: 'history', label: 'Patient Details + History', icon: UsersRound },
];

const patientSections = [
  { id: 'input_hub', label: 'Prediction Inputs', icon: ClipboardList },
  { id: 'prediction_result', label: 'Prediction Result', icon: BarChart3 },
  { id: 'knowledge_graph', label: 'Knowledge Graph', icon: Activity },
  { id: 'tracker', label: 'Tracker Calendar', icon: CalendarDays },
  { id: 'recommendation', label: 'Diet + Med Recommendations', icon: Pill },
  { id: 'history', label: 'Patient Details + History', icon: UsersRound },
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
  const [doctorSection, setDoctorSection] = useState('input_hub');
  const [patientSection, setPatientSection] = useState('input_hub');
  const [patientSearch, setPatientSearch] = useState('');
  const [manualInput, setManualInput] = useState('');
  const [pdfFile, setPdfFile] = useState(null);
  const [imageFile, setImageFile] = useState(null);
  const [structured, setStructured] = useState(initialStructured);
  const [result, setResult] = useState(null);
  const [featureResults, setFeatureResults] = useState({
    manual: null,
    columns: null,
    pdf: null,
    image: null,
  });
  const [appointments, setAppointments] = useState([]);
  const [notifications, setNotifications] = useState([]);
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

  useEffect(() => {
    if (view !== 'doctor' && view !== 'patient') return;
    const loadTrackerData = async () => {
      try {
        const [appointmentPayload, notificationPayload] = await Promise.all([
          getAppointments(activePatientId),
          getNotifications(activePatientId, false),
        ]);
        setAppointments(appointmentPayload.appointments || []);
        setNotifications(notificationPayload.notifications || []);
      } catch (_err) {
        // Keep view interactive even when tracker APIs are unavailable.
      }
    };
    loadTrackerData();
  }, [view, activePatientId]);

  const openLogin = (role) => {
    setLoginRole(role);
    setView('login');
  };

  const runPrediction = async () => {
    setLoading(true);
    setError('');
    try {
      let nextResult = null;
      if (mode === 'manual') {
        if (!manualInput.trim()) {
          setError('Please enter patient details before running analysis.');
          return;
        }
        nextResult = await getPrediction(manualInput.trim());
      } else if (mode === 'columns') {
        const payload = {};
        Object.entries(structured).forEach(([key, value]) => {
          if (value !== '') payload[key] = Number.isNaN(Number(value)) ? value : Number(value);
        });
        if (Object.keys(payload).length === 0) {
          setError('Please fill at least one clinical field.');
          return;
        }
        nextResult = await getPrediction(payload);
      } else if (mode === 'pdf') {
        if (!pdfFile) {
          setError('Please select a report PDF or text file.');
          return;
        }
        nextResult = await getPredictionFromPdf(pdfFile);
      } else if (mode === 'image') {
        if (!imageFile) {
          setError('Please upload an image for classification.');
          return;
        }
        nextResult = await getPredictionFromImage(imageFile);
      }
      if (nextResult) {
        setResult(nextResult);
        setFeatureResults((previous) => ({ ...previous, [mode]: nextResult }));
      }
      setValidatedRecommendation(false);
      if (nextResult && view === 'doctor') {
        setDoctorSection('recommendation');
      }
    } catch (err) {
      setError(err.message || 'Prediction request failed.');
    } finally {
      setLoading(false);
    }
  };

  const goHome = () => setView('landing');
  const openDoctor = () => openLogin('doctor');
  const openPatient = () => openLogin('patient');
  const openDoctorDashboard = () => {
    setView('doctor');
    setDoctorSection('input_hub');
  };
  const openPatientDashboard = () => {
    setView('patient');
    setPatientSection('input_hub');
  };

  const withNav = (content) => (
    <>
      <CommonNav
        activeView={view}
        activeLoginRole={loginRole}
        onHome={goHome}
        onDoctor={openDoctor}
        onPatient={openPatient}
        onDoctorDashboard={openDoctorDashboard}
        onPatientDashboard={openPatientDashboard}
      />
      {content}
    </>
  );

  if (view === 'login') {
    return (
      <div className="login-viewport">
        {withNav(
          <LoginPage
            role={loginRole}
            onBack={goHome}
            onLoginSuccess={(user) => {
              const nextView = loginRole;
              setView(nextView);
              if (nextView === 'doctor') setDoctorSection('input_hub');
              else setPatientSection('input_hub');
              if (user?.patient_id) setActivePatientId(user.patient_id);
            }}
            onSwitchRole={() => setLoginRole((r) => (r === 'doctor' ? 'patient' : 'doctor'))}
          />
        )}
      </div>
    );
  }

  if (view === 'doctor' || view === 'patient') {
    return withNav(
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
        featureResults={featureResults}
        appointments={appointments}
        notifications={notifications}
        patientSearch={patientSearch}
        setActivePatientId={setActivePatientId}
        setDoctorSection={setDoctorSection}
        setPatientSection={setPatientSection}
        setPatientSearch={setPatientSearch}
        setImageFile={setImageFile}
        setManualInput={setManualInput}
        setMode={setMode}
        setPdfFile={setPdfFile}
        setStructured={setStructured}
        setTrackingDone={setTrackingDone}
        setValidatedRecommendation={setValidatedRecommendation}
        setAppointments={setAppointments}
        setNotifications={setNotifications}
        structured={structured}
        trackingDone={trackingDone}
        validatedRecommendation={validatedRecommendation}
        onBack={goHome}
        onRunPrediction={runPrediction}
      />
    );
  }

  return withNav(<LandingPage onDoctor={openDoctor} onPatient={openPatient} />);
}

function CommonNav({ activeView, activeLoginRole, onHome, onDoctor, onPatient, onDoctorDashboard, onPatientDashboard }) {
  const isLanding = activeView === 'landing';

  return (
    <nav className="nav common-nav">
      <div className="nav-inner">
        <button className="nav-logo common-brand" type="button" onClick={onHome}>
          <span className="logo-mark brand-mark-shape">
            <HeartPulse size={14} />
          </span>
          <strong>Progena IVF</strong>
        </button>
        <div className="nav-links common-nav-links">
          {isLanding ? (
            <>
              <a className="nav-link" href="#about">About us</a>
              <a className="nav-link" href="#services">Our Services</a>
              <a className="nav-link" href="#steps">How it Works</a>
              <span className="nav-sep" />
              <button className="nav-cta nav-login-btn" type="button" onClick={onDoctor}>Login</button>
            </>
          ) : (
            <>
              <button className={`nav-link ${activeView === 'landing' ? 'active' : ''}`} type="button" onClick={onHome}>Home</button>
              <button className={`nav-link ${activeView === 'login' && activeLoginRole === 'doctor' ? 'active' : ''}`} type="button" onClick={onDoctor}>Doctor Login</button>
              <button className={`nav-link ${activeView === 'login' && activeLoginRole === 'patient' ? 'active' : ''}`} type="button" onClick={onPatient}>Patient Login</button>
              <button
                className={`nav-link nav-icon-link ${activeView === 'doctor' ? 'active' : ''}`}
                type="button"
                onClick={onDoctorDashboard}
                title="Doctor Dashboard"
                aria-label="Doctor Dashboard"
              >
                <Stethoscope size={19} />
              </button>
              <button
                className={`nav-link nav-icon-link ${activeView === 'patient' ? 'active' : ''}`}
                type="button"
                onClick={onPatientDashboard}
                title="Patient Dashboard"
                aria-label="Patient Dashboard"
              >
                <UserRound size={19} />
              </button>
            </>
          )}
        </div>
      </div>
    </nav>
  );
}

function LandingPage({ onDoctor, onPatient }) {
  return (
    <main className="wecare-stage">
      <section className="screen visible wecare-page">
        <motion.section 
          className="hero wecare-hero"
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
        >
          <div className="hero-left hero-copy">
            <motion.div 
              className="hero-eyebrow mini-kicker"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.2, duration: 0.6 }}
            >
              <span className="hero-eyebrow-text">Clinical IVF intelligence</span>
              <span className="hero-eyebrow-line" />
            </motion.div>
            <motion.h1 
              className="hero-h1"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4, duration: 0.8 }}
            >
              From first consult to transfer day, make every IVF decision with confidence.
            </motion.h1>
            <motion.p 
              className="hero-sub"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.6, duration: 0.8 }}
            >
              Progena brings prediction, report understanding, treatment tracking, and doctor-validated recommendations into one clear workflow for clinics and patients.
            </motion.p>
            <motion.div 
              className="hero-actions role-cards"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.8, duration: 0.8 }}
            >
              <Button className="btn btn-primary interactive-element" onClick={onDoctor}>
                Start as Doctor <ArrowRight size={16} />
              </Button>
              <Button variant="ghost" className="btn btn-secondary interactive-element" onClick={onPatient}>
                Open Patient Portal <ArrowRight size={16} />
              </Button>
            </motion.div>
            <motion.div 
              className="hero-micro-proof"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1.0, duration: 0.8 }}
            >
              <span><CheckCircle2 size={16} /> Explainable outputs</span>
              <span><CheckCircle2 size={16} /> Role-gated access</span>
              <span><CheckCircle2 size={16} /> Longitudinal cycle tracking</span>
            </motion.div>
            <motion.div 
              className="hero-trust"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 1.2, duration: 0.8 }}
            >
              <div className="trust-avatars">
                <span className="trust-avatar" style={{ background: '#14b8a6' }}>IVF</span>
                <span className="trust-avatar" style={{ background: '#0f766e' }}>AI</span>
                <span className="trust-avatar" style={{ background: '#0d9488' }}>MD</span>
              </div>
              Trusted by fertility specialists and care teams.
            </motion.div>
          </div>
          <div className="hero-right">
            <HeroImagePanel />
          </div>
        </motion.section>

        <motion.section 
          className="stats-bar stats-band"
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.8 }}
        >
          <StatCard value="850+" label="Clinical signals interpreted" />
          <StatCard value="30k+" label="Structured report fields" />
          <StatCard value="24x7" label="Always-on decision support" />
        </motion.section>

        <motion.section 
          className="review-band appointment-band" 
          id="about"
          initial={{ opacity: 0, x: -30 }}
          whileInView={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.8 }}
          viewport={{ once: true }}
        >
          <div className="section-copy hero-copy">
            <span className="section-eyebrow">Why teams choose Progena</span>
            <h2 className="h2">One workflow for prediction, review, and patient communication.</h2>
            <p>
              Clinical teams can evaluate narrative notes, numeric inputs, PDFs, and embryo imagery in one place. Patients only see approved insights shared by their specialist.
            </p>
            <div className="bullet-list">
              <span><CheckCircle2 size={16} /> Consistent doctor and patient journey</span>
              <span><CheckCircle2 size={16} /> Doctor-validated recommendations only</span>
              <span><CheckCircle2 size={16} /> Better follow-up with timeline continuity</span>
            </div>
            <Button className="btn btn-primary interactive-element" onClick={onDoctor}>
              Explore specialist workspace <ArrowRight size={16} />
            </Button>
          </div>
          <div className="calendar-card">
            <div className="calendar-head">
              <strong>February</strong>
              <span>Cycle visits</span>
            </div>
            <div className="calendar-grid">
              {Array.from({ length: 28 }, (_, index) => (
                <button className={[7, 15, 18, 25].includes(index + 1) ? 'marked' : ''} key={index} type="button">
                  {index + 1}
                </button>
              ))}
            </div>
          </div>
        </motion.section>

        <motion.section 
          className="steps-section" 
          id="steps"
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          viewport={{ once: true }}
        >
          <span className="section-eyebrow">How it works</span>
          <h2>4 steps from intake to validated care guidance</h2>
          <div className="how-grid step-grid">
            <StepCard icon={ClipboardList} title="Capture case data" text="Use narrative notes, clinical fields, PDFs, and image uploads." />
            <StepCard icon={BarChart3} title="Generate prediction" text="Get explainable outcome estimates with key drivers and risk paths." />
            <StepCard icon={CalendarDays} title="Coordinate treatment" text="Schedule milestones, track progress, and notify patients." />
            <StepCard icon={ShieldCheck} title="Publish validated guidance" text="Share only clinician-approved recommendations to patient portal." />
          </div>
        </motion.section>

        <section className="landing-services feature-grid animate-slide-up" id="services">
          <ServiceTile icon={ClipboardList} title="Narrative Cycle AI" text="Capture detailed notes and run structured reasoning." />
          <ServiceTile icon={BarChart3} title="Clinical Signal Matrix" text="Submit numeric and clinical fields directly to prediction." />
          <ServiceTile icon={FileText} title="Report Intelligence" text="Upload reports and extract probability with explanation." />
          <ServiceTile icon={ImageIcon} title="Embryo Image Lens" text="Classify uploaded images with confidence and explanation." />
        </section>

        <section className="cta-banner animate-fade-in">
          <h2>Improve IVF coordination without adding workflow overhead.</h2>
          <p>Bring prediction, evidence review, follow-up planning, and validated guidance into one shared interface.</p>
          <div className="cta-banner-actions">
            <Button className="btn btn-primary interactive-element" onClick={onDoctor}>
              Open doctor tools <ArrowRight size={16} />
            </Button>
            <Button variant="ghost" className="btn btn-secondary interactive-element" onClick={onPatient}>
              Open patient portal <ArrowRight size={16} />
            </Button>
          </div>
        </section>

        <footer className="footer landing-footer">
          <div>
            <strong className="footer-col-title">Progena IVF</strong>
            <p className="footer-tagline">AI-assisted clinical fertility workflow for doctors and patients.</p>
          </div>
          <div>
            <strong className="footer-col-title">Care Workflow</strong>
            <p className="footer-link">Prediction</p>
            <p className="footer-link">Analysis</p>
            <p className="footer-link">Tracking</p>
            <p className="footer-link">Validation</p>
          </div>
          <div>
            <strong className="footer-col-title">Patient Support</strong>
            <p className="footer-link">support@progena.ai</p>
            <p className="footer-link">+91 90000 00000</p>
          </div>
          <div>
            <strong className="footer-col-title">Specialist Access</strong>
            <p className="footer-link" role="button" tabIndex={0} onClick={onDoctor} onKeyDown={(event) => event.key === 'Enter' && onDoctor()}>Doctor Login</p>
            <p className="footer-link" role="button" tabIndex={0} onClick={onPatient} onKeyDown={(event) => event.key === 'Enter' && onPatient()}>Patient Login</p>
          </div>
        </footer>
      </section>
    </main>
  );
}

function LoginPage({ role, onBack, onLoginSuccess, onSwitchRole }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [authBusy, setAuthBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoginError('');
    setPassword('');
    (async () => {
      try {
        const payload = await getLoginExampleEmail(role);
        if (!cancelled) setEmail(payload.email || '');
      } catch (_err) {
        if (!cancelled) {
          setEmail(role === 'doctor' ? 'doctor@progena.ai' : 'patient@progena.ai');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [role]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setLoginError('');
    setAuthBusy(true);
    try {
      const payload = await loginDemo({ email: email.trim(), password, role });
      if (payload?.user) onLoginSuccess(payload.user);
    } catch (err) {
      setLoginError(err.message || 'Login failed');
    } finally {
      setAuthBusy(false);
    }
  };

  return (
    <main className="login-root login-root--fit">
      <section className="auth-wrap login-card login-card--compact">
        <form className="auth-form-side" onSubmit={handleSubmit}>
          <button type="button" className="btn-back" onClick={onBack}><ArrowLeft size={15} /> Back to Home</button>
          <div className="role-toggle">
            <button className={`role-btn ${role === 'doctor' ? 'active' : ''}`} type="button" onClick={() => role !== 'doctor' && onSwitchRole()}>Doctor</button>
            <button className={`role-btn ${role === 'patient' ? 'active' : ''}`} type="button" onClick={() => role !== 'patient' && onSwitchRole()}>Patient</button>
          </div>
          <div className="auth-badge">{role === 'doctor' ? 'Doctor Access' : 'Patient Access'}</div>
          <div className="auth-h2">{role === 'doctor' ? 'Welcome back, Doctor.' : 'Your care portal.'}</div>
          <div className="auth-sub">
            {role === 'doctor'
              ? 'Clinical workspace: predictions, reports, imaging, tracking, and validation.'
              : 'Appointments, results, and doctor-approved guidance - all in one place.'}
          </div>
          <div className="form-field">
            <label className="form-label">Email</label>
            <input
              className="form-input"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              type="email"
              autoComplete="username"
              required
            />
          </div>
          <div className="form-field">
            <label className="form-label">Password</label>
            <input
              className="form-input"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              type="password"
              autoComplete="current-password"
              required
            />
            <div className="form-helper">Use your demo credentials from the backend example endpoint.</div>
          </div>
          {loginError ? <p className="login-error">{loginError}</p> : null}
          <div className="login-actions">
            <button className="btn btn-primary interactive-element" type="submit" disabled={authBusy}>
              {authBusy ? 'Signing in…' : 'Login'}
            </button>
            <button className="btn btn-secondary interactive-element" type="button" onClick={onSwitchRole}>
              Switch role
            </button>
          </div>
          <div className="auth-demo-hint"><strong>Demo:</strong> Accounts are validated from JSON (no real DB)</div>
        </form>
        <LoginVisual role={role} />
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
    patientSearch,
    error,
    imageFile,
    loading,
    manualInput,
    mode,
    pdfFile,
    probability,
    recommendations,
    result,
    featureResults,
    appointments,
    notifications,
    setActivePatientId,
    setDoctorSection,
    setPatientSection,
    setPatientSearch,
    setImageFile,
    setManualInput,
    setMode,
    setPdfFile,
    setStructured,
    setTrackingDone,
    setValidatedRecommendation,
    setAppointments,
    setNotifications,
    structured,
    trackingDone,
    validatedRecommendation,
    onBack,
    onRunPrediction,
  } = props;

  const isDoctor = role === 'doctor';
  const sectionItems = isDoctor ? doctorSections : patientSections;
  const activeSection = isDoctor ? doctorSection : patientSection;
  const filteredPatients = patientRoster.filter((patient) => {
    const query = patientSearch.trim().toLowerCase();
    if (!query) return true;
    return `${patient.id} ${patient.name}`.toLowerCase().includes(query);
  });

  return (
    <main className="screen visible">
      <section className="dash-layout dash-root">
        <aside className="dash-sidebar sidebar">
          <div className="sidebar-head logo-lockup">
            <button className="sidebar-logo" type="button" onClick={onBack}>
              <HeartPulse size={20} />
              <strong>Progena IVF</strong>
            </button>
          </div>
          <div className="sidebar-section">{isDoctor ? 'Doctor modules' : 'Patient modules'}</div>
          <div className="sidebar-list">
            {sectionItems.map((item) => (
              <button
                key={item.id}
                className={`sidebar-item ${activeSection === item.id ? 'active' : ''}`}
                type="button"
                onClick={() => {
                  if (isDoctor) setDoctorSection(item.id);
                  else setPatientSection(item.id);
                  if (item.id === 'input_hub') setMode('manual');
                }}
              >
                <item.icon size={16} className="sidebar-icon" />
                <span>{item.label}</span>
              </button>
            ))}
          </div>
          {isDoctor ? (
            <div className="doctor-quick-panel">
              <label htmlFor="patient-search" className="doctor-quick-label">Find patient</label>
              <input
                id="patient-search"
                className="patient-search-input"
                value={patientSearch}
                onChange={(event) => setPatientSearch(event.target.value)}
                placeholder="Search by name or ID"
              />
              <div className="doctor-quick-patient-list">
                {filteredPatients.slice(0, 5).map((patient) => (
                  <button
                    key={patient.id}
                    type="button"
                    className={`doctor-quick-patient ${patient.id === activePatientId ? 'active' : ''}`}
                    onClick={() => setActivePatientId(patient.id)}
                  >
                    <span>{patient.name}</span>
                    <small>{patient.id}</small>
                  </button>
                ))}
              </div>
              <div className="doctor-quick-options">
                <button type="button" onClick={() => setDoctorSection('prediction_result')}>Go to Result</button>
                <button type="button" onClick={() => setDoctorSection('recommendation')}>Go to Recommendation</button>
              </div>
            </div>
          ) : null}
          <button className="btn-outline" type="button" onClick={onBack}>Back to Landing</button>
        </aside>

        <section className="dash-content">
          <div className="dash-body">
            <section className="dash-panel visible">
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
                  setMode={setMode}
                  pdfFile={pdfFile}
                  probability={probability}
                  result={result}
                  featureResults={featureResults}
                  appointments={appointments}
                  setImageFile={setImageFile}
                  setManualInput={setManualInput}
                  setPdfFile={setPdfFile}
                  setStructured={setStructured}
                  setTrackingDone={setTrackingDone}
                  setValidatedRecommendation={setValidatedRecommendation}
                  setAppointments={setAppointments}
                  structured={structured}
                  trackingDone={trackingDone}
                  validatedRecommendation={validatedRecommendation}
                  featureResults={featureResults}
                  appointments={appointments}
                  notifications={notifications}
                  setNotifications={setNotifications}
                  onRunPrediction={onRunPrediction}
                />
              ) : (
                <PatientSectionView
                  activeSection={activeSection}
                  activePatient={activePatient}
                  activePatientId={activePatientId}
                  probability={probability}
                  recommendations={recommendations}
                  result={result}
                  error={error}
                  imageFile={imageFile}
                  loading={loading}
                  manualInput={manualInput}
                  mode={mode}
                  setMode={setMode}
                  pdfFile={pdfFile}
                  setImageFile={setImageFile}
                  setManualInput={setManualInput}
                  setPdfFile={setPdfFile}
                  setStructured={setStructured}
                  structured={structured}
                  trackingDone={trackingDone}
                  validatedRecommendation={validatedRecommendation}
                  featureResults={featureResults}
                  appointments={appointments}
                  notifications={notifications}
                  setNotifications={setNotifications}
                  onRunPrediction={onRunPrediction}
                />
              )}
            </section>
          </div>
        </section>
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
    setMode,
    pdfFile,
    probability,
    result,
    featureResults,
    setImageFile,
    setManualInput,
    setPdfFile,
    setStructured,
    setTrackingDone,
    setValidatedRecommendation,
    setAppointments,
    structured,
    trackingDone,
    validatedRecommendation,
    appointments,
    onRunPrediction,
  } = props;

  if (activeSection === 'input_hub' || ['manual', 'clinical', 'report', 'image'].includes(activeSection)) {
    return (
      <div className="doctor-input-stack doctor-input-stack--single">
        <InputWorkspace
          error={error}
          imageFile={imageFile}
          loading={loading}
          manualInput={manualInput}
          mode={mode}
          setMode={setMode}
          pdfFile={pdfFile}
          setImageFile={setImageFile}
          setManualInput={setManualInput}
          setPdfFile={setPdfFile}
          setStructured={setStructured}
          structured={structured}
          onRunPrediction={onRunPrediction}
        />
      </div>
    );
  }

  if (activeSection === 'prediction_result') {
    const modeResult = featureResults[mode] || result;
    return (
      <div className="doctor-input-stack">
        <StructuredPredictionResult
          activePatient={activePatient}
          activeSection={activeSection}
          imageFile={imageFile}
          loading={loading}
          manualInput={manualInput}
          mode={mode}
          pdfFile={pdfFile}
          probability={probability}
          result={modeResult}
          structured={structured}
        />
      </div>
    );
  }

  if (activeSection === 'tracker') {
    return (
      <TrackingPanel
        trackingDone={trackingDone}
        setTrackingDone={setTrackingDone}
        appointments={appointments}
        setAppointments={setAppointments}
        activePatientId={activePatientId}
      />
    );
  }

  if (activeSection === 'knowledge_graph') {
    return <KnowledgeGraphPanel result={result} />;
  }

  if (activeSection === 'recommendation') {
    return (
      <PatientRecommendation
        validated={validatedRecommendation}
        recommendations={result ? (result.explanation?.key_drivers || []) : starterRecommendation}
        dietItems={result?.explanation?.personalized_diet || []}
        medicationItems={result?.explanation?.personalized_medication || []}
        canValidate
        hasResult={Boolean(result)}
        onValidate={() => setValidatedRecommendation((value) => !value)}
      />
    );
  }

  return <PatientHistoryCard activePatient={activePatient} />;
}

function PatientSectionView(props) {
  const {
    activeSection,
    activePatient,
    activePatientId,
    probability,
    recommendations,
    result,
    error,
    imageFile,
    loading,
    manualInput,
    mode,
    setMode,
    pdfFile,
    setImageFile,
    setManualInput,
    setPdfFile,
    setStructured,
    structured,
    trackingDone,
    validatedRecommendation,
    featureResults,
    appointments,
    notifications,
    setNotifications,
    onRunPrediction,
  } = props;

  if (activeSection === 'input_hub' || ['manual', 'clinical', 'report', 'image'].includes(activeSection)) {
    return (
      <div className="doctor-input-stack doctor-input-stack--single">
        <InputWorkspace
          error={error}
          imageFile={imageFile}
          loading={loading}
          manualInput={manualInput}
          mode={mode}
          setMode={setMode}
          pdfFile={pdfFile}
          setImageFile={setImageFile}
          setManualInput={setManualInput}
          setPdfFile={setPdfFile}
          setStructured={setStructured}
          structured={structured}
          onRunPrediction={onRunPrediction}
        />
      </div>
    );
  }

  if (activeSection === 'prediction_result') {
    const modeResult = featureResults[mode] || result;
    return (
      <div className="doctor-input-stack">
        <StructuredPredictionResult
          activePatient={activePatient}
          imageFile={imageFile}
          loading={loading}
          mode={mode}
          probability={probability}
          result={modeResult}
        />
      </div>
    );
  }

  if (activeSection === 'tracker') {
    return (
      <PatientTrackerQueryPanel
        done={trackingDone}
        appointments={appointments}
        notifications={notifications}
        activePatientId={activePatientId}
        setNotifications={setNotifications}
      />
    );
  }
  if (activeSection === 'knowledge_graph') {
    return <KnowledgeGraphPanel result={result} />;
  }
  if (activeSection === 'recommendation') {
    return (
      <PatientRecommendation
        validated={validatedRecommendation}
        recommendations={recommendations}
        dietItems={result?.explanation?.personalized_diet || []}
        medicationItems={result?.explanation?.personalized_medication || []}
      />
    );
  }
  if (activeSection === 'history') return <PatientHistoryCard activePatient={activePatient} patientId={activePatientId} />;
  return <ConnectDoctorCard />;
}

function InputWorkspace(props) {
  const {
    error,
    imageFile,
    loading,
    manualInput,
    mode,
    setMode,
    pdfFile,
    setImageFile,
    setManualInput,
    setPdfFile,
    setStructured,
    structured,
    onRunPrediction,
  } = props;
  const modeOptions = [
    { value: 'manual', label: 'Narrative Cycle AI' },
    { value: 'columns', label: 'Clinical Signal Matrix' },
    { value: 'pdf', label: 'Report Intelligence' },
    { value: 'image', label: 'Embryo Image Lens' },
  ];

  return (
    <section className="panel compact-panel">
      <h3>{modeTitle(mode)}</h3>
      <div className="input-mode-picker">
        <label htmlFor="input-source">Input source</label>
        <div className="input-mode-chips" role="tablist" aria-label="Prediction input source">
          {modeOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              className={`input-mode-chip ${mode === option.value ? 'active' : ''}`}
              onClick={() => setMode(option.value)}
              aria-pressed={mode === option.value}
            >
              {option.label}
            </button>
          ))}
        </div>
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
        <Button className="btn-primary" loading={loading} type="button" onClick={onRunPrediction} disabled={loading}>
          {loading ? 'Analysing...' : 'Run Analysis'} <ArrowRight size={14} />
        </Button>
        {error ? <p className="error">{error}</p> : <p>Prediction uses existing backend APIs and schema.</p>}
      </div>
    </section>
  );
}

function modeTitle(mode) {
  if (mode === 'columns') return 'Clinical Signal Input';
  if (mode === 'pdf') return 'Report Intelligence Upload';
  if (mode === 'image') return 'Embryo Image Lens Upload';
  return 'Narrative Cycle Input';
}

function StructuredPredictionResult({ imageFile, loading, mode, probability, result }) {
  const probabilityValue = typeof result?.probability === 'number'
    ? Math.round((result.probability <= 1 ? result.probability * 100 : result.probability))
    : probability;
  return (
    <section className="panel feature-result-stack">
      <div className="feature-result-topline">
        <h3>Feature Prediction Result</h3>
        <span>{probabilityValue ? `${probabilityValue}%` : 'Pending'}</span>
      </div>
      {mode === 'image' ? (
        <ImageClassificationView result={result} imageFile={imageFile} loading={loading} />
      ) : (
        <ResultCard result={result} loading={loading} />
      )}
    </section>
  );
}

function KnowledgeGraphPanel({ result }) {
  return (
    <section className="panel compact-panel graph-priority-panel">
      <h3>Knowledge Graph</h3>
      <p>Interactive causal map for IVF factors, pathways, and predicted outcome confidence.</p>
      {result ? (
        <GraphView
          graphData={result?.graph}
          riskPaths={result?.risk_paths}
          criticalPath={result?.critical_path}
          explanation={result?.explanation}
        />
      ) : (
        <div className="result-card">Run a prediction from Narrative, Clinical, Report, or Image sections to load graph reasoning.</div>
      )}
    </section>
  );
}

function ImageClassificationView({ result, imageFile, loading }) {
  if (loading) return <div className="result-card">Running image classification...</div>;
  if (!result) return <div className="result-card">Upload an image and run analysis to see classification output.</div>;

  const probabilityPct = typeof result.probability === 'number'
    ? `${(result.probability * 100).toFixed(1)}%`
    : result.probability || 'Not available';

  const explanation = typeof result.explanation === 'string'
    ? result.explanation
    : result.explanation?.summary || 'No explanation available.';

  const uploadedPreview = imageFile ? URL.createObjectURL(imageFile) : null;

  return (
    <div className="result-card">
      <h2>Image Classification Result</h2>
      <div className="meta">
        <div><strong>Prediction:</strong> {result.prediction}</div>
        <div><strong>Probability:</strong> {probabilityPct}</div>
        <div><strong>Confidence:</strong> {result.confidence}</div>
      </div>
      <div className="image-compare-grid">
        <div>
          <strong>Original image</strong>
          {result.original_image ? (
            <img src={result.original_image} alt="Uploaded original" />
          ) : uploadedPreview ? (
            <img src={uploadedPreview} alt="Uploaded original preview" />
          ) : (
            <p>No original image preview available.</p>
          )}
        </div>
        <div>
          <strong>Grad-CAM heatmap</strong>
          {result.gradcam_image ? (
            <img src={result.gradcam_image} alt="Grad-CAM overlay" />
          ) : (
            <p>{result.gradcam_fallback || 'Grad-CAM image is unavailable in this environment.'}</p>
          )}
        </div>
      </div>
      <div className="block">
        <h3>Explanation</h3>
        <p>{explanation}</p>
      </div>
    </div>
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

function TrackingPanel({ trackingDone, setTrackingDone, appointments, setAppointments, activePatientId }) {
  const [form, setForm] = useState({
    title: 'Follicle monitoring scan',
    date: '',
    time: '',
    note: '',
  });
  const [message, setMessage] = useState('');

  const schedule = async () => {
    if (!form.date || !form.time) {
      setMessage('Please pick date and time for appointment.');
      return;
    }
    try {
      const payload = await createAppointment({
        patient_id: activePatientId,
        title: form.title,
        date: form.date,
        time: form.time,
        note: form.note,
      });
      setAppointments((previous) => [...previous, payload.appointment]);
      setMessage('Appointment scheduled and patient notified.');
      setForm((previous) => ({ ...previous, note: '' }));
    } catch (err) {
      setMessage(err.message || 'Failed to schedule appointment.');
    }
  };

  return (
    <section className="panel compact-panel">
      <h3>Treatment Tracking Calendar</h3>
      <p>Plan and publish patient appointments from this section.</p>
      <div className="timeline">
        {treatmentSteps.map((step, index) => (
          <button className={index < trackingDone ? 'done' : ''} key={step} type="button" onClick={() => setTrackingDone(index + 1)}>
            <CheckCircle2 size={16} /> {step}
          </button>
        ))}
      </div>
      <div className="calendar-form-grid">
        <label>
          Appointment
          <input value={form.title} onChange={(event) => setForm((p) => ({ ...p, title: event.target.value }))} />
        </label>
        <label>
          Date
          <input type="date" value={form.date} onChange={(event) => setForm((p) => ({ ...p, date: event.target.value }))} />
        </label>
        <label>
          Time
          <input type="time" value={form.time} onChange={(event) => setForm((p) => ({ ...p, time: event.target.value }))} />
        </label>
        <label>
          Note
          <input value={form.note} onChange={(event) => setForm((p) => ({ ...p, note: event.target.value }))} placeholder="Optional note" />
        </label>
      </div>
      <button className="btn-primary" type="button" onClick={schedule}>Schedule Next Appointment</button>
      {message ? <p className="request-status">{message}</p> : null}
      <div className="appointment-list">
        {appointments.map((item) => (
          <span key={item.id}>{item.date} {item.time} - {item.title}</span>
        ))}
      </div>
    </section>
  );
}

function PatientRecommendation({ validated, recommendations, dietItems = [], medicationItems = [], canValidate = false, hasResult = false, onValidate }) {
  const [activeTab, setActiveTab] = useState('overview');
  const [checkedItems, setCheckedItems] = useState({});
  const showContent = canValidate ? hasResult : validated;
  const markDone = (key) => {
    setCheckedItems((prev) => ({ ...prev, [key]: !prev[key] }));
  };
  const completedCount = Object.values(checkedItems).filter(Boolean).length;
  const combinedMedication = [...medicationItems, ...dietItems];
  const totalActionItems = recommendations.length + combinedMedication.length;

  const renderActionList = (items, prefix) => (
    <ul className="recommendations actionable-list">
      {items.map((item, index) => {
        const key = `${prefix}-${index}`;
        const done = Boolean(checkedItems[key]);
        return (
          <li key={key} className={`actionable-item ${done ? 'done' : ''}`}>
            <button type="button" onClick={() => markDone(key)} aria-pressed={done}>
              <CheckCircle2 size={16} />
            </button>
            <span>{item}</span>
          </li>
        );
      })}
    </ul>
  );

  return (
    <section className="panel compact-panel">
      <h3>Diet and Med Recommendations</h3>
      {canValidate ? (
        <button className="btn-primary" type="button" disabled={!hasResult} onClick={onValidate}>
          {validated ? 'Recommendations Validated' : 'Validate and Release Recommendations'}
        </button>
      ) : null}
      {showContent ? (
        <>
          <div className="recommendation-toolbar">
            <div className="recommendation-tabs" role="tablist" aria-label="Recommendation views">
              <button type="button" className={`recommendation-tab ${activeTab === 'overview' ? 'active' : ''}`} onClick={() => setActiveTab('overview')}>Overview</button>
              <button type="button" className={`recommendation-tab ${activeTab === 'medication' ? 'active' : ''}`} onClick={() => setActiveTab('medication')}>Medication & Lifestyle</button>
            </div>
            <div className="recommendation-stats">
              <span className="recommendation-stat">Actions: {totalActionItems}</span>
              <span className="recommendation-stat">Completed: {completedCount}</span>
            </div>
          </div>

          <div className="recommendation-split">
            {activeTab === 'overview' ? (
              <div>
                <h4>Clinical Priorities</h4>
                {renderActionList(recommendations, 'rec')}
              </div>
            ) : null}
            {activeTab === 'medication' ? (
              <div>
                <h4>Medication and Lifestyle Guidance</h4>
                {renderActionList((combinedMedication.length ? combinedMedication : ['Guidance will appear after prediction.']), 'med')}
              </div>
            ) : null}
          </div>
        </>
      ) : (
        <div className="locked">
          <LockKeyhole size={24} />
          <p>{canValidate ? 'Run a prediction to generate recommendations.' : 'Waiting for doctor validation.'}</p>
        </div>
      )}
    </section>
  );
}

function ReportViewer({ result }) {
  return (
    <section className="panel compact-panel">
      <h3>Report Analysis</h3>
      <p>{result?.explanation?.summary || 'Your analysed report will appear after doctor review.'}</p>
      <GraphView graphData={result?.graph} riskPaths={result?.risk_paths} criticalPath={result?.critical_path} explanation={result?.explanation} />
    </section>
  );
}

function TreatmentTimeline({ done }) {
  return (
    <section className="panel compact-panel">
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

function PatientTrackerQueryPanel({ done, appointments, notifications, activePatientId, setNotifications }) {
  const [query, setQuery] = useState('');
  const [sent, setSent] = useState(false);

  const sendQuery = () => {
    if (!query.trim()) return;
    setSent(true);
    setQuery('');
  };

  const markRead = async (notificationId) => {
    try {
      await markNotificationRead(activePatientId, notificationId);
      setNotifications((previous) =>
        previous.map((item) => (item.id === notificationId ? { ...item, is_read: true } : item))
      );
    } catch (_err) {
      // Keep UI responsive if network call fails.
    }
  };

  return (
    <section className="panel">
      <h3>Tracker and Doctor Appointments</h3>
      <p>Your doctor plans appointments here. You can send cycle-related queries.</p>
      <div className="timeline readonly">
        {treatmentSteps.map((step, index) => (
          <div className={index < done ? 'done' : ''} key={step}>
            <CheckCircle2 size={16} /> {step}
          </div>
        ))}
      </div>
      <div className="appointment-list">
        {appointments.length ? appointments.map((item) => (
          <span key={item.id}>{item.date} {item.time} - {item.title}</span>
        )) : <span>No doctor appointments scheduled yet.</span>}
      </div>
      <div className="notification-list">
        {(notifications || []).slice(0, 5).map((item) => (
          <button key={item.id} type="button" className={item.is_read ? 'is-read' : ''} onClick={() => markRead(item.id)}>
            {item.message}
          </button>
        ))}
      </div>
      <div className="patient-query-box">
        <textarea
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          rows={3}
          placeholder="Ask your doctor: symptoms, medication doubts, appointment questions..."
        />
        <button className="btn-primary" type="button" onClick={sendQuery}>Send Query</button>
      </div>
      {sent ? <p className="request-status">Query sent to your doctor.</p> : null}
    </section>
  );
}

function ClinicalVisualization({ probability, result }) {
  return (
    <section className="panel">
      <h3>3D Visualization</h3>
      <div className="viz-orbit">
        <span />
        <span />
        <span />
        <div className="viz-core">{probability ? `${probability}%` : 'AI'}</div>
      </div>
      <p>{result ? 'Readiness is mapped from prediction and risk pathways.' : 'Run an analysis for visualization context.'}</p>
    </section>
  );
}

function PatientHistoryCard({ activePatient, patientId }) {
  return (
    <section className="panel">
      <h3>Patient Details and Medical History</h3>
      <p>Name: {activePatient.name}</p>
      <p>Patient ID: {patientId || activePatient.id}</p>
      <p>Age: {activePatient.age}</p>
      <p>Current stage: {activePatient.stage}</p>
      <p>Risk status: {activePatient.risk}</p>
      <p>Medication history: hormonal stimulation protocol under monitoring.</p>
    </section>
  );
}

function ConnectDoctorCard() {
  const [requested, setRequested] = useState(false);

  const handleRequest = () => {
    setRequested(true);
    window.location.href = 'mailto:doctor@progena.ai?subject=IVF Consultation Request';
  };

  return (
    <section className="panel">
      <h3>Connect to Doctor</h3>
      <p>Dr. Neri Kwang | Fertility Specialist</p>
      <p>Availability: Mon-Sat | 10:00 AM to 5:00 PM</p>
      <p>Next appointment sync is shown in your tracker calendar after doctor updates.</p>
      <button className="btn-primary" type="button" onClick={handleRequest}>Request Consultation</button>
      {requested ? <p className="request-status">Request sent. Your mail app was opened for confirmation.</p> : null}
    </section>
  );
}

function ServiceTile({ icon: Icon, title, text }) {
  return (
    <article className="feature-card service-tile">
      <div className="feature-icon">
        <Icon size={22} />
      </div>
      <h3>{title}</h3>
      <p>{text}</p>
      <span className="feature-learn">Learn more</span>
    </article>
  );
}

function StepCard({ icon: Icon, title, text }) {
  return (
    <article className="how-card step-card">
      <div className="how-card-icon"><Icon size={24} /></div>
      <h3 className="how-card-title">{title}</h3>
      <p className="how-card-desc">{text}</p>
    </article>
  );
}

function StatCard({ value, label }) {
  return (
    <article className="stat-card">
      <strong className="stat-card-num">{value}</strong>
      <span className="stat-card-label">{label}</span>
    </article>
  );
}

function InteractiveHeroPanel() {
  return (
    <div className="hero-visual" aria-label="Interactive IVF dashboard preview">
      <div className="hero-monitor">
        <div className="monitor-top">
          <span />
          <span />
          <span />
        </div>
        <div className="monitor-grid">
          <div className="mini-chart">
            {[42, 68, 52, 82, 61, 74, 48, 88].map((height, index) => (
              <i style={{ height: `${height}%` }} key={index} />
            ))}
          </div>
          <div className="embryo-map">
            <span />
            <span />
            <span />
            <strong>IVF</strong>
          </div>
          <div className="signal-list">
            <em />
            <em />
            <em />
          </div>
        </div>
      </div>
      <div className="floating-control control-a"><FileText size={18} /> Report analysis</div>
      <div className="floating-control control-b"><ShieldCheck size={18} /> Doctor validation</div>
      <div className="floating-control control-c"><CalendarDays size={18} /> Cycle tracker</div>
    </div>
  );
}

function HeroImagePanel() {
  return (
    <div className="hero-image-panel hero-right-content">
      <img className="hero-right-img" src={heroScrubsImage} alt="Clinical IVF care specialist with stethoscope" />
      <div className="hero-image-card image-card-top">
        <ShieldCheck size={18} />
        <span>
          <strong>Doctor validated</strong>
          <small>Guidance released after review</small>
        </span>
      </div>
      <div className="hero-image-card image-card-bottom">
        <HeartPulse size={18} />
        <span>
          <strong>IVF prediction</strong>
          <small>Reports, fields, and cycle tracking</small>
        </span>
      </div>
    </div>
  );
}

function LoginVisual({ role }) {
  return (
    <div className="auth-visual-side login-visual" aria-label="Secure medical login visual">
      <img className="login-scrubs-image" src={loginStethoscopeImage} alt="Stethoscope on a clinical document" />
      <div className="auth-visual-content">
        <div className="auth-visual-title">{role === 'doctor' ? 'Doctor Workspace Security' : 'Patient Portal Security'}</div>
        <div className="auth-visual-desc">Every record, recommendation, and message is encrypted and role-gated.</div>
      </div>
      <div className="auth-feature-list">
        <div className="auth-feature">
          <div className="auth-feature-icon"><ShieldCheck size={15} /></div>
          <div className="auth-feature-text"><strong>Doctor-gated outputs</strong><span>No AI content reaches patients without approval</span></div>
        </div>
        <div className="auth-feature">
          <div className="auth-feature-icon"><BarChart3 size={15} /></div>
          <div className="auth-feature-text"><strong>Full audit log</strong><span>Track every access, edit, and validation event</span></div>
        </div>
        <div className="auth-feature">
          <div className="auth-feature-icon"><ImageIcon size={15} /></div>
          <div className="auth-feature-text"><strong>Grad-CAM imaging</strong><span>Explainable AI for embryo classification</span></div>
        </div>
      </div>
      <div className="auth-visual-footer">Progena IVF · HIPAA · ISO 27001 · Doctor validated · © 2026</div>
    </div>
  );
}

export default App;
