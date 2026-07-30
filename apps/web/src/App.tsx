import { BrowserRouter, Routes, Route } from "react-router-dom";
import { SiteLayout } from "./components/SiteLayout";
import Home from "./pages/Home";
import About from "./pages/About";
import Services from "./pages/Services";
import Contact from "./pages/Contact";

export function App() {
  return (
    <BrowserRouter>
      <SiteLayout>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/about" element={<About />} />
          <Route path="/services" element={<Services />} />
          <Route path="/contact" element={<Contact />} />
          <Route path="*" element={<div className="p-8 text-center text-gray-500">404 — Page not found</div>} />
        </Routes>
      </SiteLayout>
    </BrowserRouter>
  );
}
