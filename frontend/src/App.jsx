import React from 'react';
import { useState } from 'react';
import TopStrip from './components/TopStrip';
import Navbar from './components/Navbar';
import Hero from './components/Hero';
import About from './components/About';
import Features from './components/Features';
import HowItWorks from './components/HowItWorks';
import Trust from './components/Trust';
import PredictWorkbench from './components/PredictWorkbench';
import CTA from './components/CTA';
import Footer from './components/Footer';

function App() {
  const [page, setPage] = useState('home');

  return (
    <>
      <TopStrip />
      <Navbar onNavigate={setPage} />
      {page === 'home' ? (
        <main>
          <Hero />
          <About />
          <Features />
          <HowItWorks />
          <Trust />
          <CTA />
        </main>
      ) : (
        <main>
          <PredictWorkbench />
        </main>
      )}
      <Footer />
    </>
  );
}

export default App;
