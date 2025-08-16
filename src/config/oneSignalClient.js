// src/config/oneSignalClient.js
import { Client } from "onesignal-node";
import dotenv from "dotenv";

dotenv.config();

const oneSignalClient = new Client(
  process.env.ONESIGNAL_APP_ID,
  process.env.ONESIGNAL_API_KEY
);

export default oneSignalClient;
