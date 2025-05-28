const express = require('express');
const router = express.Router();

router.get('/db-test', async (req, res) => {
  let conn;
  try {
    conn = await oracledb.getConnection();
    const result = await conn.execute('SELECT 1 AS TEST FROM dual');
    res.json(result.rows);
  } catch (err) {
    console.error('❌ DB Test Error:', err);
    res.status(500).send('DB connection failed');
  } finally {
    if (conn) await conn.close();
  }
});

module.exports = router;
