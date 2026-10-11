import { createRoot } from "react-dom/client";
import { StrictMode } from "react";
import "../../styles/tokens.css";
import "../../styles/base.css";
import "../../styles/app.css";
import "../../styles/attendant.css";
import Attendant from "../pages/Attendant.jsx";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <Attendant />
  </StrictMode>,
);
