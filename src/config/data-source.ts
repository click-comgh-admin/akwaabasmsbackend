import { DataSource } from "typeorm";
import * as dotenv from "dotenv";
import * as fs from "fs";
import { CronLog } from "../entities/CronLog";
import { Schedule } from "../entities/Schedule";
import { Recipient } from "../entities/Recipient";
import { SMSLog } from "../entities/SMSLog";
import { ScheduledMessage } from "../entities/ScheduledMessage";
dotenv.config();

console.log("📦 Loaded Environment Variables:");
console.table({
  DB_HOST: process.env.DB_HOST,
  DB_PORT: process.env.DB_PORT,
  DB_USER: process.env.DB_USER,
  DB_PASSWORD: process.env.DB_PASSWORD ? '***' : undefined,
  DB_NAME: process.env.DB_NAME,
});

// Read the CA certificate file
const caCert = fs.readFileSync("ca-certificate.crt");

export const AppDataSource = new DataSource({
  type: "postgres",
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 25060),
  username: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME || "defaultdb",
  ssl: caCert
    ? {
        rejectUnauthorized: true,
        ca: caCert,
      }
    : undefined,
  entities: [
    Schedule,
    Recipient,
    SMSLog,
    CronLog,
    ScheduledMessage,
  ],
  migrations: [
    "dist/migrations/**/*.js",
  ],
  synchronize: false,
  logging: true, // Enable logging to debug
});