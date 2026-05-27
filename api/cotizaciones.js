const Airtable = require('airtable');

// Normalize Airtable date to YYYY-MM-DD
function nd(d){ return d ? d.toString().slice(0,10) : ''; }

// Add N business days to a date (no Chilean holidays in v1)
function addBusinessDays(dateStr, days) {
  const d = new Date(dateStr + 'T12:00:00');
  let added = 0;
  while (added < days) {
    d.setDate(d.getDate() + 1);
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) added++;
  }
  return d.toISOString().slice(0, 10);
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const base = new Airtable({ apiKey: process.env.AIRTABLE_TOKEN })
      .base(process.env.AIRTABLE_BASE_ID);

    const records = await base('Cotizaciones')
      .select({
        filterByFormula: `{Estado comercial} = "Aprobada"`,
        fields: [
          'Saldo pendiente',
          'Condición de venta',
          'Fecha instalación',
          'Fecha de facturación',
          'Pago a días',
        ],
      })
      .all();

    const conFecha = [];   // quotes with determinable payment date
    const sinFecha = [];   // quotes needing manual date assignment

    for (const r of records) {
      const f = r.fields;
      const monto = parseFloat(f['Saldo pendiente']) || 0;
      if (monto <= 0) continue;

      const condicion = (f['Condición de venta'] || '').trim();
      const fechaInstalacion = nd(f['Fecha instalación']);
      const fechaFacturacion = nd(f['Fecha de facturación']);
      const pagoADias = parseInt(f['Pago a días']) || 0;

      let fechaPago = null;
      let motivo = '';

      if (condicion === '% Abono de reserva') {
        if (fechaInstalacion) {
          // Payment date = installation date - 1 day
          const d = new Date(fechaInstalacion + 'T12:00:00');
          d.setDate(d.getDate() - 1);
          fechaPago = d.toISOString().slice(0, 10);
        } else {
          motivo = 'Sin fecha de instalación';
        }
      } else if (condicion === 'Contra factura') {
        if (fechaFacturacion && pagoADias > 0) {
          fechaPago = addBusinessDays(fechaFacturacion, pagoADias);
        } else if (!fechaFacturacion) {
          motivo = 'Sin fecha de facturación';
        } else if (!pagoADias) {
          motivo = 'Sin "Pago a días"';
        }
      } else {
        motivo = `Condición desconocida: ${condicion}`;
      }

      const entry = {
        id: r.id,
        monto,
        condicion,
        fechaInstalacion,
        fechaFacturacion,
        pagoADias,
      };

      if (fechaPago) {
        conFecha.push({ ...entry, fechaPago });
      } else {
        sinFecha.push({ ...entry, motivo });
      }
    }

    res.json({ conFecha, sinFecha });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};
