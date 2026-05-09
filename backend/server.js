require('dotenv').config();
const express = require('express');
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = process.env.API_PORT || process.env.PORT || 8080;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(express.static(path.join(__dirname, 'public')));

const healthRoute = require('./src/routes/health.route');
const promptRoute = require('./src/routes/prompt.route');

app.use('/', healthRoute);
app.use('/', promptRoute);

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});