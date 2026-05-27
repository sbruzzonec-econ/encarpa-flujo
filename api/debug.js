const Airtable = require('airtable');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  try {
    const base = new Airtable({ apiKey: process.env.AIRTABLE_TOKEN })
      .base(process.env.AIRTABLE_BASE_ID);

    const tabla = req.query.tabla || 'Movimientos de caja';
    const filtro = req.query.filtro || '';

    const opts = { maxRecords: 3 };
    if (filtro) opts.filterByFormula = filtro;

    const records = await base(tabla).select(opts).firstPage();

    res.json({ tabla, filtro, sample: records.map(r => ({ id: r.id, fields: r.fields })) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
