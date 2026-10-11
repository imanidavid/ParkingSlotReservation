import { createRoot } from "react-dom/client";
import { StrictMode } from "react";
import "../../styles/tokens.css";
import "../../styles/base.css";
import "../../styles/app.css";
import "../../styles/browse.css";
import Browse from "../pages/Browse.jsx";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <Browse />
  </StrictMode>,
);
