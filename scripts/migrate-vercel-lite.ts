import { neon } from "@neondatabase/serverless";
import { config } from "dotenv";
import fs from "node:fs";
import path from "node:path";

config({ path: path.resolve(".env.local"), override: false });

const connectionString = process.env.DATABASE_URL;
if (!connectionString)
  throw new Error("DATABASE_URL 未配置；不能运行 Vercel Lite 迁移");

const sql = neon(connectionString);
const migrationDirectory = path.resolve("vercel/migrations");
const migrationFiles = fs
  .readdirSync(migrationDirectory)
  .filter(file => /^\d+.*\.sql$/u.test(file))
  .sort();
let statementCount = 0;
for (const file of migrationFiles) {
  const statements = fs
    .readFileSync(path.join(migrationDirectory, file), "utf8")
    .split(/;\s*(?:\r?\n|$)/u)
    .map(statement => statement.trim())
    .filter(Boolean);
  for (const statement of statements) await sql.query(statement);
  statementCount += statements.length;
}
console.log(
  JSON.stringify({
    ok: true,
    migrations: migrationFiles,
    statements: statementCount,
  })
);
