import { createRoot } from "react-dom/client";
import { StrictMode } from "react";
import "../../styles/tokens.css";
import "../../styles/base.css";
import "../../styles/auth.css";
import "../pages/register.css";
import Register from "../pages/Register.jsx";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <Register />
  </StrictMode>,
);
