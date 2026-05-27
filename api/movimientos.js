const Airtable = require('airtable');

// Normalize Airtable date to YYYY-MM-DD
function nd(d){ return d ? d.toString().slice(0,10) : ''; }

// Safely extract text value from field (handles arrays and plain values)
function fv(f){ return Array.isArray(f) ? (f[0]||'').toString().trim() : (f||'').toString().trim(); }

// Mapping: concept name → app category
const EGRESO_MAP = {
  'Combustible y peajes':              'variables',
  'Sueldo no base':                    'variables',
  'Transporte y flete':                'variables',
  'Insumos':                           'variables',
  'Subarriendo activos fijos':         'variables',
  'Costuras y confección':             'variables',
  'Sueldo base':                       'fijos',
  'Marketing y publicidad':            'fijos',
  'Arriendo bodega/Servicios básicos': 'fijos',
  'Imposiciones':                      'fijos',
  'Sueldo gerencias':                  'gerencial',
  'Retiro socios':                     'gerencial',
  'IVA':                               'iva',
  'PPM':                               'ppm',
  'Amortización préstamos bancarios':  'amort',
  // Otros (explicit)
  'Mantención activos fijos':          'otros',
  'Comisiones de venta':               'otros',
  'Otros servicios empresariales':     'otros',
  'Otros impuestos':                   'otros',
  'Patente comercial':                 'otros',
  'Intereses financieros':             'otros',
  'Compra de activo fijo':             'otros',
  'Devolución por nota de crédito':    'otros',
  'Devolución préstamo de socios':     'otros',
  'Gastos extraordinarios':            'otros',
  'Servicios y gastos/impuestos bancarios': 'otros',
};

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { start, end } = req.query;
  if (!start || !end) return res.status(400).json({ error: 'start and end required' });

  try {
    const base = new Airtable({ apiKey: process.env.AIRTABLE_TOKEN })
      .base(process.env.AIRTABLE_BASE_ID);

    const formula = `AND(
      IS_AFTER({Fecha del movimiento}, DATEADD("${start}", -1, 'days')),
      IS_BEFORE({Fecha del movimiento}, DATEADD("${end}", 1, 'days'))
    )`;

    const records = await base('Movimientos de caja')
      .select({
        filterByFormula: formula,
        fields: [
          'Fecha del movimiento',
          'Monto neto',
          'Flujo',
          'Nombre concepto',   // ← new lookup field added by Luca
          'Descripción',       // ← human-readable description
          'Personal vinculado',
        ],
        view: 'Todos los movimientos',
      })
      .all();

    const ingresos = [];
    const variables = [], fijos = [], gerencial = [], iva = [], ppm = [], amort = [], otros = [];

    for (const r of records) {
      const f = r.fields;
      const monto  = Math.abs(parseFloat(f['Monto neto']) || 0);
      const concepto = fv(f['Nombre concepto']); // concept category name
      const descripcion = (f['Descripción'] || '').toString().trim();
      const personal = Array.isArray(f['Personal vinculado'])
        ? f['Personal vinculado'].join(', ')
        : (f['Personal vinculado'] || '');
      const fecha  = nd(f['Fecha del movimiento']);
      const flujo  = fv(f['Flujo']);

      // Display: use Descripción if available, else concept + personal
      const desc = descripcion || (personal ? `${concepto} — ${personal}` : concepto);

      if (flujo === 'Ingreso') {
        ingresos.push({ id: r.id, desc, amount: monto, fecha, concepto, source: 'airtable' });
      } else {
        const cat = EGRESO_MAP[concepto] || 'otros';
        const item = { id: r.id, desc, amount: monto, fecha, concepto, source: 'airtable' };
        if      (cat === 'variables')  variables.push(item);
        else if (cat === 'fijos')      fijos.push(item);
        else if (cat === 'gerencial')  gerencial.push(item);
        else if (cat === 'iva')        iva.push(item);
        else if (cat === 'ppm')        ppm.push(item);
        else if (cat === 'amort')      amort.push(item);
        else                           otros.push(item);
      }
    }

    res.json({ ingresos, variables, fijos, gerencial, iva, ppm, amort, otros });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};
