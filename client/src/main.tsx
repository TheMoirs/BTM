import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { captureInstallPrompt } from "./lib/install-prompt";

captureInstallPrompt();

// Mark the page while it's being printed, for browsers that print without
// applying the print layout (see "html.printing" in index.css)
const markPrinting = (on: boolean) => document.documentElement.classList.toggle("printing", on);
window.addEventListener("beforeprint", () => markPrinting(true));
window.addEventListener("afterprint", () => markPrinting(false));
window.matchMedia?.("print").addEventListener?.("change", (e) => markPrinting(e.matches));

createRoot(document.getElementById("root")!).render(<App />);
