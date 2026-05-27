const Airtable = require('airtable');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  try {
    const base = new Airtable({ apiKey: process.env.AIRTABLE_TOKEN })
      .base(process.env.AIRTABLE_BASE_ID);

    const table = req.query.tabla || 'Movimientos de caja';
    const view  = req.query.vista  || undefined;

    const records = await base(table)
      .select({ maxRecords: 3, ...(view ? {view} : {}) })
      .firstPage();

    res.json({ tabla: table, sample: records.map(r => ({ id: r.id, fields: r.fields })) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
