
const healthCheck = (req, res) => {
    console.log('Health check endpoint called');
    res.status(200).json({ status: 'healthy' });
};

module.exports = {
  healthCheck,
};