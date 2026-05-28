const Airtable = require('airtable');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const base = new Airtable({ apiKey: process.env.AIRTABLE_TOKEN })
      .base(process.env.AIRTABLE_BASE_ID);
    const TABLE = 'App State';

    if (req.method === 'GET') {
      const records = await base(TABLE).select({ maxRecords: 1 }).firstPage();
      if (!records.length) return res.json({ state: null });
      const raw = records[0].fields['data'];
      res.json({ state: raw ? JSON.parse(raw) : null, id: records[0].id });

    } else if (req.method === 'POST') {
      const { state } = req.body || {};
      if (!state) return res.status(400).json({ error: 'state required' });
      const data = JSON.stringify(state);
      const records = await base(TABLE).select({ maxRecords: 1 }).firstPage();
      if (!records.length) {
        await base(TABLE).create([{ fields: { data } }]);
      } else {
        await base(TABLE).update(records[0].id, { data });
      }
      res.json({ ok: true });
    } else {
      res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};
