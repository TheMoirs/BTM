import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { captureInstallPrompt } from "./lib/install-prompt";

captureInstallPrompt();

createRoot(document.getElementById("root")!).render(<App />);
