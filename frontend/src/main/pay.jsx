import { createRoot } from "react-dom/client";
import { StrictMode } from "react";
import "../../styles/tokens.css";
import "../../styles/base.css";
import "../../styles/app.css";
import "../../styles/pay.css";
import Pay from "../pages/Pay.jsx";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <Pay />
  </StrictMode>,
);
