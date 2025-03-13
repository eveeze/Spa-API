// app.js

import express from "express";
import cors from "cors";
import dotenv from "dotenv";

// import routes
import customerRoutes from "./routes/customerRoutes.js";
import ownerRoutes from "./routes/ownerRoutes.js";
dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());

// define routes
app.use("/api/customer", customerRoutes);
app.use("/api/owner", ownerRoutes);

const PORT = process.env.PORT || 5000;

app.get("/", (req, res) => {
  res.send("selamat datang di api ema baby spa");
});

app.listen(PORT, () => {
  console.log(`Server sudah berjalan di port : ${PORT}`);
});

export default app;
