import { BrowserRouter, Routes, Route } from "react-router-dom";
import Home from "./pages/Home.jsx";
import CreateSurvey from "./pages/CreateSurvey.jsx";
import SurveyCreated from "./pages/SurveyCreated.jsx";
import TakeSurvey from "./pages/TakeSurvey.jsx";
import ThankYou from "./pages/ThankYou.jsx";
import AdminView from "./pages/AdminView.jsx";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/create" element={<CreateSurvey />} />
        <Route path="/survey-created" element={<SurveyCreated />} />
        <Route path="/survey/:id" element={<TakeSurvey />} />
        <Route path="/thank-you" element={<ThankYou />} />
        <Route path="/admin/:id" element={<AdminView />} />
      </Routes>
    </BrowserRouter>
  );
}
