import React from "react";
import ReactDOM from "react-dom/client";

// The token contract. Imported once, here — every colour, radius, shadow and duration in
// the app resolves through it.
import "./styles/globals.css";
import { App } from "./App";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
