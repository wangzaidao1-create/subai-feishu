const express = require('express');
const handler = require('./api/feishu');

const app = express();

app.use(express.json({ limit: '1mb' }));

app.get('/', (req, res) => {
  res.send('subai-feishu is running');
});

app.all('/api/feishu', async (req, res) => {
  try {
    await handler(req, res);
  } catch (e) {
    console.error('Server error:', e);
    res.status(500).json({ error: 'internal error' });
  }
});

const port = process.env.PORT || 3000;
app.listen(port, '0.0.0.0', () => {
  console.log(`Server running on port ${port}`);
});
