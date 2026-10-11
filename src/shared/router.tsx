import { createHashRouter } from "react-router-dom";
import HandleNavigation from "@/pages/HandleAuth";

import { SystemThemePreferred, withAuthHOC } from '@gingersociety/ginger-ui';
import ExampleComponent from "@/pages/ExamplePage";


const router = createHashRouter([
  {
    path: "/handle-auth/:access_token/:refresh_token",
    element: <HandleNavigation />,
  },
  {
    path: "/public/example",
    element: <ExampleComponent />,
  },
]);

export default router;
