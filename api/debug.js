const Airtable = require('airtable');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  try {
    const base = new Airtable({ apiKey: process.env.AIRTABLE_TOKEN })
      .base(process.env.AIRTABLE_BASE_ID);

    // Fetch last 5 records from Movimientos de caja
    const records = await base('Movimientos de caja')
      .select({
        maxRecords: 5,
        view: 'Todos los movimientos',
      })
      .firstPage();

    const sample = records.map(r => ({
      id: r.id,
      fields: r.fields
    }));

    res.json({ ok: true, sample });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
