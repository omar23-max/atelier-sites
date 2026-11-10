import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import Catalogue from "./Catalogue.jsx";
import { OriginProvider } from "./origins.jsx";
import "../tokens.css";
import "../styles.css";
import "./catalogue.css";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <OriginProvider>
      <Catalogue />
    </OriginProvider>
  </StrictMode>,
);
