const Airtable = require('airtable');

function nd(d){ return d ? d.toString().slice(0,10) : ''; }

function addCalendarDays(dateStr, days) {
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

// Calculates fechaPago for a record (returns null if can't be determined)
function calcFechaPago(condicion, fechaInstalacion, inicioEvento, fechaFacturacion, pagoADias) {
  if (condicion === '% Abono de reserva') {
    if (fechaInstalacion) {
      const d = new Date(fechaInstalacion + 'T12:00:00');
      d.setDate(d.getDate() - 1);
      return d.toISOString().slice(0, 10);
    } else if (inicioEvento) {
      const d = new Date(inicioEvento + 'T12:00:00');
      d.setDate(d.getDate() - 2);
      return d.toISOString().slice(0, 10);
    }
  } else if (condicion === 'Contra factura') {
    if (fechaFacturacion && pagoADias > 0) {
      return addCalendarDays(fechaFacturacion, pagoADias);
    }
  }
  return null;
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

    const conFecha = [];
    const sinFecha = [];
    const pagadas  = []; // saldo pendiente = 0 pero tenían fecha calculable

    for (const r of records) {
      const f = r.fields;
      const monto = parseFloat(f['Saldo pendiente']) || 0;

      const condicion       = (f['Condición de venta'] || '').trim();
      const fechaInstalacion = nd(f['Fecha instalación']);
      const inicioEvento    = nd(f['Inicio evento']);
      const fechaFacturacion = nd(f['Fecha de facturación']);
      const pagoADias       = parseInt(f['Pago a días']) || 0;

      const nombreCuenta = Array.isArray(f['Nombre cuenta'])
        ? (f['Nombre cuenta'][0] || '').toString().trim()
        : (f['Nombre cuenta'] || '').toString().trim();
      const idCot = f['ID'] || r.id;

      const baseEntry = {
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

      // Cotización pagada en su totalidad (saldo = 0)
      if (monto <= 0) {
        const fechaPago = calcFechaPago(condicion, fechaInstalacion, inicioEvento, fechaFacturacion, pagoADias);
        if (fechaPago) {
          // Incluir en pagadas — el frontend recuperará el monto desde su caché
          pagadas.push({ ...baseEntry, fechaPago });
        }
        continue;
      }

      // Cotización con saldo pendiente > 0
      const fechaPago = calcFechaPago(condicion, fechaInstalacion, inicioEvento, fechaFacturacion, pagoADias);
      let motivo = '';

      if (!fechaPago) {
        if (condicion === '% Abono de reserva') {
          motivo = 'Campos faltantes: Fecha instalación e Inicio evento';
        } else if (condicion === 'Contra factura') {
          motivo = !fechaFacturacion ? 'Campo faltante: Fecha de facturación' : 'Campo faltante: Pago a días';
        } else {
          motivo = `Condición de venta desconocida: "${condicion}" — revisa Airtable`;
        }
      }

      if (fechaPago) {
        conFecha.push({ ...baseEntry, fechaPago });
      } else {
        sinFecha.push({ ...baseEntry, motivo });
      }
    }

    res.json({ conFecha, sinFecha, pagadas });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};
