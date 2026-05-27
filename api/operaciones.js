const Airtable = require('airtable');

// Normalize Airtable date to YYYY-MM-DD
function nd(d){ return d ? d.toString().slice(0,10) : ''; }

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { start, end } = req.query;
  if (!start || !end) return res.status(400).json({ error: 'start and end required' });

  try {
    const base = new Airtable({ apiKey: process.env.AIRTABLE_TOKEN })
      .base(process.env.AIRTABLE_BASE_ID);

    const formula = `AND(
      IS_AFTER({Fecha inicio}, DATEADD("${start}", -1, 'days')),
      IS_BEFORE({Fecha inicio}, DATEADD("${end}", 1, 'days'))
    )`;

    const records = await base('Operaciones')
      .select({
        filterByFormula: formula,
        fields: ['Mts2 equivalentes', 'Fecha inicio'],
        view: 'Todas las operaciones',
      })
      .all();

    const total = records.reduce((s, r) =>
      s + (parseFloat(r.fields['Mts2 equivalentes']) || 0), 0
    );

    res.json({ m2eq: Math.round(total), records: records.map(r => ({
      'Mts2 equivalentes': r.fields['Mts2 equivalentes'],
      'Fecha inicio': nd(r.fields['Fecha inicio'])
    })) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};
