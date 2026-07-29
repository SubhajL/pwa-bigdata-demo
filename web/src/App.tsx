import { RouterProvider } from "react-router-dom";

import { createAppRouter } from "@/routes/router";

const router = createAppRouter();

export function App(): JSX.Element {
  return <RouterProvider router={router} />;
}
