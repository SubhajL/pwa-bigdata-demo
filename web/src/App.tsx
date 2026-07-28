import { APP_CONFIG } from "./config/app.config";

export function App(): JSX.Element {
  return (
    <main>
      <h1>{APP_CONFIG.brand}</h1>
      <p>PWA Big Data Demo — scaffold (S0)</p>
    </main>
  );
}
