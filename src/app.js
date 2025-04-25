const express = require("express");
const bodyParser = require("body-parser");
const planRoutes = require("./routes/planRoutes");

const app = express();
app.use(bodyParser.json());

app.use("/v1/plan", planRoutes);

module.exports = app;
