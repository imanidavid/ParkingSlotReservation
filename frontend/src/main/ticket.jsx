import { createRoot } from "react-dom/client";
import { StrictMode } from "react";
import "../../styles/tokens.css";
import "../../styles/base.css";
import "../../styles/app.css";
import "../../styles/slip.css";
import TicketPage from "../pages/TicketPage.jsx";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <TicketPage />
  </StrictMode>,
);
