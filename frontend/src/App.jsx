import React, { useEffect, useMemo, useState } from 'react';
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
import {
  createAppointment,
  getAppointments,
  getNotifications,
  getPrediction,
  getPredictionFromImage,
  getPredictionFromPdf,
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
  { id: 'manual', label: 'Narrative Cycle AI', icon: ClipboardList },
  { id: 'clinical', label: 'Clinical Signal Matrix', icon: BarChart3 },
  { id: 'report', label: 'Report Intelligence', icon: FileText },
  { id: 'image', label: 'Embryo Image Lens', icon: ImageIcon },
  { id: 'tracker', label: 'Treatment Tracking', icon: CalendarDays },
  { id: 'recommendation', label: 'Diet + Med Recommendations', icon: Pill },
  { id: 'history', label: 'Patient Details + History', icon: UsersRound },
];

const patientSections = [
  { id: 'manual', label: 'Narrative Cycle AI', icon: ClipboardList },
  { id: 'clinical', label: 'Clinical Signal Matrix', icon: BarChart3 },
  { id: 'report', label: 'Report Intelligence', icon: FileText },
  { id: 'image', label: 'Embryo Image Lens', icon: ImageIcon },
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
  const [doctorSection, setDoctorSection] = useState('manual');
  const [patientSection, setPatientSection] = useState('manual');
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
    setDoctorSection('manual');
  };
  const openPatientDashboard = () => {
    setView('patient');
    setPatientSection('manual');
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
    return withNav(
      <LoginPage
        role={loginRole}
        onBack={goHome}
        onLogin={() => {
          setView(loginRole);
          if (loginRole === 'doctor') setDoctorSection('manual');
          else setPatientSection('manual');
        }}
        onSwitchRole={() => setLoginRole((role) => (role === 'doctor' ? 'patient' : 'doctor'))}
      />
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
    <nav className="common-nav">
      <button className="common-brand" type="button" onClick={onHome}>
        <span className="brand-mark-shape" />
        <strong>Progena IVF</strong>
      </button>
      <div className="common-nav-links">
        {isLanding ? (
          <>
            <a href="#about">About us</a>
            <a href="#services">Our Services</a>
            <a href="#steps">How it Works</a>
            <button className="nav-login-btn" type="button" onClick={onDoctor}>Login</button>
          </>
        ) : (
          <>
            <button className={activeView === 'landing' ? 'active' : ''} type="button" onClick={onHome}>Home</button>
            <button className={activeView === 'login' && activeLoginRole === 'doctor' ? 'active' : ''} type="button" onClick={onDoctor}>Doctor Login</button>
            <button className={activeView === 'login' && activeLoginRole === 'patient' ? 'active' : ''} type="button" onClick={onPatient}>Patient Login</button>
            <button className={activeView === 'doctor' ? 'active' : ''} type="button" onClick={onDoctorDashboard}>Doctor Dashboard</button>
            <button className={activeView === 'patient' ? 'active' : ''} type="button" onClick={onPatientDashboard}>Patient Dashboard</button>
          </>
        )}
      </div>
    </nav>
  );
}

function LandingPage({ onDoctor, onPatient }) {
  return (
    <main className="wecare-stage">
      <section className="wecare-page">
        <section className="wecare-hero">
          <div className="hero-copy">
            <span className="mini-kicker">Fertility intelligence</span>
            <h1>Find IVF insights that can guide every cycle.</h1>
            <p>
              Progena IVF helps doctors and patients move from raw reports to outcome prediction,
              treatment tracking, graph reasoning, and validated care guidance.
            </p>
            <div className="role-cards">
              <button className="role-card" type="button" onClick={onDoctor}>
                <Stethoscope size={22} />
                <div>
                  <strong>Doctor View</strong>
                  <small>Run predictions, validate recommendations, manage patient history.</small>
                </div>
                <ArrowRight size={16} />
              </button>
              <button className="role-card" type="button" onClick={onPatient}>
                <UserRound size={22} />
                <div>
                  <strong>Patient View</strong>
                  <small>Review reports, track treatment, connect with the doctor.</small>
                </div>
                <ArrowRight size={16} />
              </button>
            </div>
          </div>
          <HeroImagePanel />
          <span className="decor decor-one" />
          <span className="decor decor-two" />
          <span className="decor decor-three" />
        </section>

        <section className="review-band" id="about">
          <div className="review-visual">
            <div className="doctor-abstract" />
            <div className="review-card card-a">
              <UserRound size={18} />
              <span>Personalized IVF tracking</span>
            </div>
            <div className="review-card card-b">
              <HeartPulse size={18} />
              <span>Prediction output with explanation</span>
            </div>
          </div>
          <div className="section-copy">
            <span className="mini-kicker">User reviews</span>
            <h2>Read the clearest IVF care pathway from one place.</h2>
            <p>
              Doctors can analyse manual notes, clinical fields, PDFs, and images. Patients see
              only the reports and guidance that the doctor has reviewed.
            </p>
            <button className="btn-primary" type="button" onClick={onDoctor}>See specialist tools <ArrowRight size={14} /></button>
          </div>
        </section>

        <section className="steps-section" id="steps">
          <span className="mini-kicker">Fastest solution</span>
          <h2>4 easy steps to get your IVF Solution</h2>
          <div className="step-grid">
            <StepCard icon={ClipboardList} title="Add patient data" text="Manual notes, clinical fields, report PDFs, or image files." />
            <StepCard icon={BarChart3} title="Run prediction" text="Use the existing IVF model output and explanation layer." />
            <StepCard icon={CalendarDays} title="Track treatment" text="Mark appointments and cycle milestones in the dashboard." />
            <StepCard icon={ShieldCheck} title="Validate guidance" text="Doctor approves diet and medication recommendations." />
          </div>
        </section>

        <section className="appointment-band">
          <div className="section-copy">
            <span className="mini-kicker">Book workflow</span>
            <h2>Consult and track IVF progress anytime.</h2>
            <p>
              The dashboard keeps output prediction, report analysis, tracker calendar,
              3D visualization, doctor details, and recommendations in one interactive flow.
            </p>
            <div className="bullet-list">
              <span><CheckCircle2 size={16} /> Uniform doctor and patient experience</span>
              <span><CheckCircle2 size={16} /> Doctor validated patient recommendations</span>
            </div>
            <button className="btn-primary" type="button" onClick={onPatient}>Open patient access <ArrowRight size={14} /></button>
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
        </section>

        <section className="stats-band">
          <StatCard value="850" label="Clinical signals" />
          <StatCard value="30000+" label="Report fields ready" />
          <StatCard value="98.4%" label="Interface confidence" />
        </section>

        <section className="landing-services" id="services">
          <ServiceTile icon={ClipboardList} title="Narrative Cycle AI" text="Capture detailed notes and run structured reasoning." />
          <ServiceTile icon={BarChart3} title="Clinical Signal Matrix" text="Submit numeric and clinical fields directly to prediction." />
          <ServiceTile icon={FileText} title="Report Intelligence" text="Upload reports and extract probability with explanation." />
          <ServiceTile icon={ImageIcon} title="Embryo Image Lens" text="Classify uploaded images with confidence and explanation." />
        </section>

        <footer className="landing-footer">
          <div>
            <strong>Progena IVF</strong>
            <p>AI-assisted clinical fertility workflow for doctors and patients.</p>
          </div>
          <div>
            <strong>Care Workflow</strong>
            <p>Prediction | Analysis | Tracking | Validation</p>
          </div>
          <div>
            <strong>Contact</strong>
            <p>support@progena.ai | +91 90000 00000</p>
          </div>
        </footer>
      </section>
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
          <LoginVisual />
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
        {isDoctor ? (
          <div className="patient-search-block">
            <label htmlFor="patient-search">Find patient by ID</label>
            <input
              id="patient-search"
              value={patientSearch}
              onChange={(event) => setPatientSearch(event.target.value)}
              placeholder="Search P-1042"
            />
            <div className="sidebar-patient-results">
              {filteredPatients.map((patient) => (
                <button
                  className={patient.id === activePatientId ? 'active' : ''}
                  key={patient.id}
                  type="button"
                  onClick={() => setActivePatientId(patient.id)}
                >
                  <strong>{patient.id}</strong>
                  <span>{patient.name}</span>
                </button>
              ))}
            </div>
          </div>
        ) : null}
        <button className="btn-outline" type="button" onClick={onBack}>Back to Landing</button>
      </aside>

      <section className="dash-content">
        <header className="dash-header">
          <div>
            <span className="tag">{isDoctor ? 'Doctor Dashboard' : 'Patient Dashboard'}</span>
            <h2>{isDoctor ? 'Clinical workflow control center' : `Welcome, ${activePatient.name}`}</h2>
          </div>
          <DashboardPulse result={result} probability={probability} isDoctor={isDoctor} />
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

  if (['manual', 'clinical', 'report', 'image'].includes(activeSection)) {
    const modeResult = featureResults[mode] || result;
    return (
      <div className="doctor-input-stack">
        <InputWorkspace
          error={error}
          imageFile={imageFile}
          loading={loading}
          manualInput={manualInput}
          mode={mode}
          pdfFile={pdfFile}
          setImageFile={setImageFile}
          setManualInput={setManualInput}
          setPdfFile={setPdfFile}
          setStructured={setStructured}
          structured={structured}
          onRunPrediction={onRunPrediction}
        />
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

  if (['manual', 'clinical', 'report', 'image'].includes(activeSection)) {
    const modeResult = featureResults[mode] || result;
    return (
      <div className="doctor-input-stack">
        <InputWorkspace
          error={error}
          imageFile={imageFile}
          loading={loading}
          manualInput={manualInput}
          mode={mode}
          pdfFile={pdfFile}
          setImageFile={setImageFile}
          setManualInput={setManualInput}
          setPdfFile={setPdfFile}
          setStructured={setStructured}
          structured={structured}
          onRunPrediction={onRunPrediction}
        />
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
    pdfFile,
    setImageFile,
    setManualInput,
    setPdfFile,
    setStructured,
    structured,
    onRunPrediction,
  } = props;

  return (
    <section className="panel compact-panel">
      <h3>{modeTitle(mode)}</h3>

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

function modeTitle(mode) {
  if (mode === 'columns') return 'Clinical Signal Input';
  if (mode === 'pdf') return 'Report Intelligence Upload';
  if (mode === 'image') return 'Embryo Image Lens Upload';
  return 'Narrative Cycle Input';
}

function StructuredPredictionResult({ imageFile, loading, mode, probability, result }) {
  const probabilityValue = typeof result?.probability === 'number' ? Math.round(result.probability * 100) : probability;
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
      <GraphView graphData={result?.graph} riskPaths={result?.risk_paths} criticalPath={result?.critical_path} explanation={result?.explanation} />
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
  return (
    <section className="panel compact-panel">
      <h3>Diet and Med Recommendations</h3>
      {canValidate ? (
        <button className="btn-primary" type="button" disabled={!hasResult} onClick={onValidate}>
          {validated ? 'Recommendations Validated' : 'Validate Recommendations'}
        </button>
      ) : null}
      {validated ? (
        <>
          <ul className="recommendations">
            {recommendations.map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}
          </ul>
          <div className="recommendation-split">
            <div>
              <h4>Personalized Diet</h4>
              <ul className="recommendations">
                {(dietItems.length ? dietItems : ['Diet plan will appear after prediction.']).map((item, index) => <li key={`diet-${index}`}>{item}</li>)}
              </ul>
            </div>
            <div>
              <h4>Medication Guidance</h4>
              <ul className="recommendations">
                {(medicationItems.length ? medicationItems : ['Medication guidance will appear after prediction.']).map((item, index) => <li key={`med-${index}`}>{item}</li>)}
              </ul>
            </div>
          </div>
        </>
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
    <article className="service-tile">
      <Icon size={20} />
      <h3>{title}</h3>
      <p>{text}</p>
    </article>
  );
}

function StepCard({ icon: Icon, title, text }) {
  return (
    <article className="step-card">
      <span><Icon size={22} /></span>
      <h3>{title}</h3>
      <p>{text}</p>
    </article>
  );
}

function StatCard({ value, label }) {
  return (
    <article className="stat-card">
      <strong>{value}</strong>
      <span>{label}</span>
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
    <div className="hero-image-panel">
      <img src={heroScrubsImage} alt="Clinical IVF care specialist with stethoscope" />
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

function LoginVisual() {
  return (
    <div className="login-visual" aria-label="Secure medical login visual">
      <img className="login-scrubs-image" src={loginStethoscopeImage} alt="Stethoscope on a clinical document" />
      <div className="login-image-shade" />
      <div className="login-data-card">
        <HeartPulse size={20} />
        <strong>Encrypted fertility workspace</strong>
        <small>Prediction, reports, tracking, and validation stay role-gated.</small>
      </div>
    </div>
  );
}

function DashboardPulse({ result, probability, isDoctor }) {
  return (
    <div className="dashboard-pulse" aria-label="Dashboard status visual">
      <div className="role-status-icon">{isDoctor ? <Stethoscope size={24} /> : <UserRound size={24} />}</div>
      <strong>{isDoctor ? 'Doctor workspace' : 'Patient workspace'}</strong>
      <small>{result ? 'Analysis ready' : 'Awaiting analysis'}</small>
    </div>
  );
}

export default App;
