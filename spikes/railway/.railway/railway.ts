import { defineRailway, github, project, service } from "railway/iac";

export default defineRailway(() => {
  const web = service("web", {
    source: github("linfordlee14/echoes_of_homes"),
    start: "node probe.js",
  });

  return project("railway", {
    resources: [web],
  });
});
