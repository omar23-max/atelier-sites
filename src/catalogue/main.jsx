import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import Catalogue from "./Catalogue.jsx";
import "../styles.css";
import "./catalogue.css";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <Catalogue />
  </StrictMode>,
);
