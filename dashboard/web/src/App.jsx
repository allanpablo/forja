import { Routes, Route } from 'react-router-dom';
import Layout from './components/Layout.jsx';
import Briefing from './pages/Briefing.jsx';
import Specs from './pages/Specs.jsx';
import Handoffs from './pages/Handoffs.jsx';
import Tokens from './pages/Tokens.jsx';
import Commands from './pages/Commands.jsx';
import Projects from './pages/Projects.jsx';
import Agents from './pages/Agents.jsx';
import Docs from './pages/Docs.jsx';
import Memory from './pages/Memory.jsx';
import Functions from './pages/Functions.jsx';
import Workflow from './pages/Workflow.jsx';
import Stack from './pages/Stack.jsx';
import SystemOverview from './pages/SystemOverview.jsx';

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Briefing />} />
        <Route path="/system" element={<SystemOverview />} />
        <Route path="/specs" element={<Specs />} />
        <Route path="/handoffs" element={<Handoffs />} />
        <Route path="/tokens" element={<Tokens />} />
        <Route path="/commands" element={<Commands />} />
        <Route path="/projects" element={<Projects />} />
        <Route path="/agents" element={<Agents />} />
        <Route path="/docs" element={<Docs />} />
        <Route path="/memory" element={<Memory />} />
        <Route path="/functions" element={<Functions />} />
        <Route path="/workflow" element={<Workflow />} />
        <Route path="/stack" element={<Stack />} />
      </Route>
    </Routes>
  );
}
