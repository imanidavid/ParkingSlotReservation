import { createRoot } from "react-dom/client";
import { StrictMode } from "react";
import "../../styles/tokens.css";
import "../../styles/base.css";
import "../../styles/app.css";
import "../../styles/ticket.css";
import "../../styles/facility.css";
import Facility from "../pages/Facility.jsx";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <Facility />
  </StrictMode>,
);
