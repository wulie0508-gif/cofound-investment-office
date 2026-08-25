import fs from "node:fs";
import path from "node:path";

const baseUrl = process.env.COF_BP_LOCAL_URL ?? "http://127.0.0.1:4010";
const directory = path.resolve(process.cwd(), "output", "pdf");
const files = fs
  .readdirSync(directory)
  .filter(file => /^\d{2}-.+\.pdf$/iu.test(file))
  .sort();

if (!files.length) throw new Error(`没有找到测试 BP：${directory}`);

const results = [];
for (const file of files) {
  const filePath = path.join(directory, file);
  const response = await fetch(`${baseUrl}/api/local/import-path`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ filePath }),
  });
  const value = (await response.json()) as Record<string, unknown>;
  if (!response.ok)
    throw new Error(`${file}: ${value.error ?? response.status}`);
  results.push({ file, ...value });
}

const projectsResponse = await fetch(`${baseUrl}/api/local/projects`);
const projects = (await projectsResponse.json()) as Array<{
  id: string;
  name: string;
  fundingRound: string | null;
  managementStatus: string;
}>;

console.log(
  JSON.stringify(
    {
      ok: true,
      imported: results.length,
      totalProjects: projects.length,
      results,
      portfolio: projects.map(project => ({
        id: project.id,
        name: project.name,
        round: project.fundingRound,
        status: project.managementStatus,
      })),
    },
    null,
    2
  )
);
