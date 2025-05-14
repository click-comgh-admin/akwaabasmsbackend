// scripts/checkSchema.ts
import "reflect-metadata";
import { AppDataSource } from "../config/data-source";

async function main() {
  await AppDataSource.initialize();

  console.log("🔍 search_path:");
  const [searchPath] = await AppDataSource.query(`SHOW search_path;`);
  console.log(searchPath);

  console.log("\n🔍 recipient columns:");
  const columns = await AppDataSource.query(`
    SELECT column_name
      FROM information_schema.columns
     WHERE table_name = 'recipient'
     ORDER BY ordinal_position;
  `);
  console.table(columns.map((row: any) => row.column_name));

  await AppDataSource.destroy();
}
main().catch(err => {
  console.error(err);
  process.exit(1);
});
