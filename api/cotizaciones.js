const Airtable = require('airtable');

// Normalize Airtable date to YYYY-MM-DD
function nd(d){ return d ? d.toString().slice(0,10) : ''; }

// Add N calendar days to a date (días corridos, no hábiles)
function addCalendarDays(dateStr, days) {
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() + days);
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
          'Inicio evento',
          'Fecha de facturación',
          'Pago a días',
          'Nombre cuenta',
          'ID',
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
      const inicioEvento     = nd(f['Inicio evento']);
      const fechaFacturacion = nd(f['Fecha de facturación']);
      const pagoADias = parseInt(f['Pago a días']) || 0;

      let fechaPago = null;
      let motivo = '';

      if (condicion === '% Abono de reserva') {
        if (fechaInstalacion) {
          // Regla principal: fecha instalación − 1 día
          const d = new Date(fechaInstalacion + 'T12:00:00');
          d.setDate(d.getDate() - 1);
          fechaPago = d.toISOString().slice(0, 10);
        } else if (inicioEvento) {
          // Regla de respaldo: inicio evento − 2 días (cuando no hay fecha instalación)
          const d = new Date(inicioEvento + 'T12:00:00');
          d.setDate(d.getDate() - 2);
          fechaPago = d.toISOString().slice(0, 10);
        } else {
          motivo = 'Sin fecha de instalación ni inicio de evento';
        }
      } else if (condicion === 'Contra factura') {
        if (fechaFacturacion && pagoADias > 0) {
          fechaPago = addCalendarDays(fechaFacturacion, pagoADias);
        } else if (!fechaFacturacion) {
          motivo = 'Sin fecha de facturación';
        } else if (!pagoADias) {
          motivo = 'Sin "Pago a días"';
        }
      } else {
        motivo = `Condición desconocida: ${condicion}`;
      }

      const nombreCuenta = Array.isArray(f['Nombre cuenta'])
        ? (f['Nombre cuenta'][0] || '').toString().trim()
        : (f['Nombre cuenta'] || '').toString().trim();
      const idCot = f['ID'] || r.id;

      const entry = {
        id: r.id,
        monto,
        condicion,
        fechaInstalacion,
        inicioEvento,
        fechaFacturacion,
        pagoADias,
        desc: nombreCuenta || `Cotización ${r.id}`,
        idCot,
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
