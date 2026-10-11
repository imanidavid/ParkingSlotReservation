import { createRoot } from "react-dom/client";
import { StrictMode } from "react";
import "../../styles/tokens.css";
import "../../styles/base.css";
import "../../styles/app.css";
import "../../styles/admin.css";
import Admin from "../pages/Admin.jsx";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <Admin />
  </StrictMode>,
);
