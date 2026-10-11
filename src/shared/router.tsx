import { createHashRouter } from "react-router-dom";
import HandleNavigation from "@/pages/HandleAuth";

import { SystemThemePreferred, withAuthHOC } from '@ginger-society/ginger-ui';
import ExampleComponent from "@/pages/ExamplePage";
import SupportDashboardPage from "@/pages/SupportDashboardPage";


const router = createHashRouter([
  {
    path: "/handle-auth/:access_token/:refresh_token",
    element: <HandleNavigation />,
  },
  {
    path: "/public/example",
    element: <SupportDashboardPage />,
  },
]);

export default router;
