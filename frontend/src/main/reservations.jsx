import { createRoot } from "react-dom/client";
import { StrictMode } from "react";
import "../../styles/tokens.css";
import "../../styles/base.css";
import "../../styles/app.css";
import "../../styles/reservations.css";
import Reservations from "../pages/Reservations.jsx";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <Reservations />
  </StrictMode>,
);
