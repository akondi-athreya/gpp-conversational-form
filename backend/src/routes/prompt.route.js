const express = require('express');
const router = express.Router();
const { generateForm } = require('../controllers/prompt.controller');

router.post('/api/form/generate', generateForm);

module.exports = router;