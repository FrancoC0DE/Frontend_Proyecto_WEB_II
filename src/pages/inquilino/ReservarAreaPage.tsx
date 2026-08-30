/**
 * ============================================================================
 * Archivo: ReservarAreaPage.tsx
 * ============================================================================
 *
 * ¿Qué hace?
 * Pantalla donde el inquilino selecciona un área común para reservar.
 * Muestra tarjetas con información de cada área (capacidad, horario,
 * costo, disponibilidad). Al hacer clic, redirige a NuevaReservaPage.
 *
 * Componentes que utiliza
 * - useData (contexto: areasDisponiblesData)
 * - useLocalDate (formato de hora)
 *
 * Props que recibe
 * - onSelectArea: (areaId) => void → Se llama al seleccionar un área
 *
 * ============================================================================
 */

import { useData } from '../../context/DataContext';
import { formatHoraAMPM } from '../../hooks/useLocalDate';
import { formatearMoneda } from '../../utils/formatters';

interface ReservarAreaPageProps {
  onSelectArea: (areaId: number) => void;
}

export default function ReservarAreaPage({ onSelectArea }: ReservarAreaPageProps) {
  const { areasDisponiblesData } = useData();

  const irANuevaReserva = (areaId: number) => {
    const area = areasDisponiblesData.find(a => a.id === areaId);
    if (!area || !area.disponible) return;
    onSelectArea(areaId);
  };

  return (
    <>
      <div className="page-header"><h2>Reservar Área</h2></div>
      <div className="area-cards-grid" id="areaCardsContainer">
        {areasDisponiblesData.map(a => (
          <div key={a.id} className="area-card" onClick={() => irANuevaReserva(a.id)}>
            <div className="area-img">
              <img src={a.imagen} alt={a.nombre} loading="lazy" />
            </div>
            <div className="area-body">
              <div className="area-name">{a.nombre}</div>
              <div className="area-detail"><strong>Capacidad</strong> {a.capacidad} personas</div>
              <div className="area-detail"><strong>Horario</strong> {formatHoraAMPM(String(a.horario_inicio).padStart(2, '0') + ':00')} - {formatHoraAMPM(String(a.horario_fin).padStart(2, '0') + ':00')}</div>
              <div className="area-detail"><strong>Costo</strong> {formatearMoneda(a.costo_por_hora)} / hora</div>
              <div className="area-status">
                <span className={`badge ${a.disponible ? 'badge-success' : 'badge-error'}`}>{a.disponible ? 'Disponible' : 'No disponible'}</span>
              </div>
              <button className="btn-primary" disabled={!a.disponible} style={a.disponible ? {} : { opacity: 0.5 }}>
                {a.disponible ? 'Reservar' : 'No disponible'}
              </button>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
