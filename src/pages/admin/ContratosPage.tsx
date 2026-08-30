/**
 * ============================================================================
 * Archivo: ContratosPage.tsx
 * ============================================================================
 */

import { useState, useCallback } from 'react';
import PageHeader from '../../components/PageHeader';
import Drawer from '../../components/Drawer';
import { useAlert } from '../../components/Alert';
import { useData } from '../../context/DataContext';
import { getLocalDateString } from '../../hooks/useLocalDate';
import { formatearCedula, validarCedula, formatearMoneda } from '../../utils/formatters';
import type { Contrato } from '../../types';

export default function ContratosPage() {
  const { 
    contratosData, 
    departamentosData, 
    crearContrato, 
    editarContrato, 
    addActivity, 
    addNotification 
  } = useData();
  const { showAlert } = useAlert();

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerMode, setDrawerMode] = useState<'create' | 'view' | 'edit'>('create');
  const [selectedItem, setSelectedItem] = useState<Contrato | null>(null);
  const [buscar, setBuscar] = useState('');
  const [filtroEstado, setFiltroEstado] = useState('');

  // Estados del Formulario
  const [cedula, setCedula] = useState('');
  const [numeroDepartamento, setNumeroDepartamento] = useState('');
  const [fechaInicio, setFechaInicio] = useState('');
  const [fechaFin, setFechaFin] = useState('');
  const [montoMensual, setMontoMensual] = useState<number>(0);
  const [montoDeposito, setMontoDeposito] = useState<number>(0);
  const [cargando, setCargando] = useState(false);

  // "Hoy" en hora LOCAL (YYYY-MM-DD): el mínimo permitido para las fechas del
  // contrato. Se usa getLocalDateString (no toISOString) para no desplazar el
  // día por la zona horaria UTC.
  const hoy = getLocalDateString();

  // Auxiliar para obtener propiedades opcionales o con distintos nombres de la interfaz
  // (compatibilidad forma API vs forma UI). El uso de `any` aquí es intencional:
  // accede a claves dinámicas que no existen en el tipo `Contrato`.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const getItemProp = useCallback((item: Contrato | null, key: string): any => {
    if (!item) return undefined;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (item as Record<string, any>)[key];
  }, []);

  // Filtrado de la lista
  const filtered = contratosData.filter(c => {
    const nombreResidente = getItemProp(c, 'nombre_residente') || getItemProp(c, 'residenteNombre') || getItemProp(c, 'residente') || '';
    if (buscar && !nombreResidente.toLowerCase().includes(buscar.toLowerCase())) return false;
    if (filtroEstado && c.estado !== filtroEstado) return false;
    return true;
  });

  const openDrawer = (mode: 'create' | 'view' | 'edit', item?: Contrato) => {
    setDrawerMode(mode);
    setSelectedItem(item || null);

    if (mode === 'edit' && item) {
      // El departamento NO se edita en un contrato: se asigna solo al crearlo.
      setFechaInicio(item.fecha_inicio || '');
      setFechaFin(item.fecha_fin || '');
      setMontoMensual(getItemProp(item, 'monto_mensual') || getItemProp(item, 'monto') || 0);
      setMontoDeposito(getItemProp(item, 'monto_deposito') || 0);
    } else if (mode === 'create') {
      setCedula('');
      setNumeroDepartamento('');
      setFechaInicio('');
      setFechaFin('');
      setMontoMensual(0);
      setMontoDeposito(0);
    }

    setDrawerOpen(true);
  };

  // Crear nuevo contrato en BD
  const handleCreateSave = useCallback(async () => {
    if (!cedula || !numeroDepartamento || !fechaInicio || !fechaFin) {
      showAlert('Por favor complete los campos obligatorios.');
      return;
    }
    const errorCedula = validarCedula(cedula);
    if (errorCedula) {
      showAlert(errorCedula);
      return;
    }
    if (!Number.isFinite(montoMensual) || montoMensual <= 0 || !Number.isFinite(montoDeposito) || montoDeposito <= 0) {
      showAlert('El monto mensual y el monto de depósito deben ser mayores a 0.');
      return;
    }

    // Regla de negocio (fechas): el contrato no puede empezar en el pasado
    // (las fechas vienen como "YYYY-MM-DD", así que la comparación lexicográfica
    // equivale a la cronológica).
    if (fechaInicio < hoy) {
      showAlert('La fecha de inicio no puede ser anterior a hoy.');
      return;
    }
    if (fechaFin <= fechaInicio) {
      showAlert('La fecha fin debe ser posterior a la fecha de inicio.');
      return;
    }

    try {
      setCargando(true);
      const nuevoId = await crearContrato({
        cedula,
        numero_departamento: numeroDepartamento,
        fecha_inicio: fechaInicio,
        fecha_fin: fechaFin,
        monto_mensual: Number(montoMensual),
        monto_deposito: Number(montoDeposito)
      });

      addActivity(`Nuevo contrato registrado`, 'fa-file-signature', 'var(--accent)');
      addNotification('admin', 'Nuevo contrato', `Se registró exitosamente un contrato.`, 'fa-file-signature', nuevoId);

      setDrawerOpen(false);
      showAlert('Contrato creado correctamente.');
    } catch (err: unknown) {
      const error = err as Error;
      showAlert(`Error al crear contrato: ${error.message}`);
    } finally {
      setCargando(false);
    }
  }, [cedula, numeroDepartamento, fechaInicio, fechaFin, montoMensual, montoDeposito, crearContrato, addActivity, addNotification, showAlert]);

  // Editar contrato existente en BD
  const handleEditSave = useCallback(async () => {
    if (!selectedItem) return;

    const contractId = getItemProp(selectedItem, 'id_contrato') || getItemProp(selectedItem, 'id');

    if (!Number.isFinite(montoMensual) || montoMensual <= 0 || !Number.isFinite(montoDeposito) || montoDeposito <= 0) {
      showAlert('El monto mensual y el monto de depósito deben ser mayores a 0.');
      return;
    }

    // Regla de negocio (fechas) al EDITAR: la fecha fin no puede ser anterior
    // ni igual a la fecha de inicio. NO se exige fecha_inicio >= hoy porque un
    // contrato existente ya puede haber empezado en el pasado.
    if (fechaFin && fechaInicio && fechaFin <= fechaInicio) {
      showAlert('La fecha fin debe ser posterior a la fecha de inicio.');
      return;
    }

    try {
      setCargando(true);
      await editarContrato(contractId, {
        fecha_inicio: fechaInicio,
        fecha_fin: fechaFin,
        monto_mensual: Number(montoMensual),
        monto_deposito: Number(montoDeposito)
      });

      addActivity(`Contrato #${contractId} actualizado`, 'fa-edit', 'var(--accent)');
      addNotification('admin', 'Contrato editado', `Se actualizó la información del contrato.`, 'fa-edit', contractId);

      setDrawerOpen(false);
      showAlert('Contrato actualizado correctamente.');
    } catch (err: unknown) {
      const error = err as Error;
      showAlert(`Error al actualizar: ${error.message}`);
    } finally {
      setCargando(false);
    }
  }, [selectedItem, fechaInicio, fechaFin, montoMensual, montoDeposito, editarContrato, addActivity, addNotification, getItemProp, showAlert]);

  const renderDrawerContent = () => {
    if (drawerMode === 'view' && selectedItem) {
      const residenteNombre = getItemProp(selectedItem, 'nombre_residente') || getItemProp(selectedItem, 'residenteNombre') || getItemProp(selectedItem, 'residente') || '';

      return (
        <div className="detail-card">
          <div className="detail-row">
            <span className="detail-label">Residente</span>
            <span className="detail-value">{residenteNombre}</span>
          </div>
          <div className="detail-row">
            <span className="detail-label">Departamento</span>
            <span className="detail-value">{selectedItem.departamento}</span>
          </div>
          <div className="detail-row">
            <span className="detail-label">Fecha Inicio</span>
            <span className="detail-value">{selectedItem.fecha_inicio}</span>
          </div>
          <div className="detail-row">
            <span className="detail-label">Fecha Fin</span>
            <span className="detail-value">{selectedItem.fecha_fin}</span>
          </div>
          <div className="detail-row">
            <span className="detail-label">Monto Mensual</span>
            <span className="detail-value">{formatearMoneda(selectedItem.monto_mensual ?? 0)}</span>
          </div>
          <div className="detail-row">
            <span className="detail-label">Monto Depósito</span>
            <span className="detail-value">{formatearMoneda(selectedItem.monto_deposito ?? 0)}</span>
          </div>
          <div className="detail-row">
            <span className="detail-label">Estado</span>
            <span className="detail-value">
              <span className={`badge ${selectedItem.estado === 'Activo' ? 'badge-success' : 'badge-warning'}`}>
                {selectedItem.estado}
              </span>
            </span>
          </div>
        </div>
      );
    }

    return (
      <div className="form-section">
        <h4>{drawerMode === 'create' ? 'Información del Nuevo Contrato' : 'Editar Contrato'}</h4>
        
        {drawerMode === 'create' && (
          <div className="form-group">
            <label>Cédula del residente *</label>
            <input 
              type="text" 
              value={cedula} 
              onChange={e => setCedula(formatearCedula(e.target.value))} 
              placeholder="1-2345-6789" 
              maxLength={11} 
            />
          </div>
        )}

        {drawerMode === 'create' ? (
          <div className="form-row">
            <div className="form-group">
              <label>Número de departamento *</label>
              <select
                value={numeroDepartamento}
                onChange={e => setNumeroDepartamento(e.target.value)}
              >
                <option value="">Seleccionar...</option>
                {departamentosData.length === 0 && (
                  <option value="" disabled>No hay departamentos. Créalos en el módulo de Departamentos.</option>
                )}
                {departamentosData.map(d => (
                  <option
                    key={d.id_departamento}
                    value={d.numero}
                    disabled={d.estado === 'Ocupado' || !d.activo}
                  >
                    {d.numero}{d.estado === 'Ocupado' ? ' (Ocupado)' : ''}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>Monto Mensual *</label>
              <input 
                type="text" 
                inputMode="numeric" 
                maxLength={8} 
                placeholder="₡0" 
                title="Formato colones CR: ₡1.234" 
                value={montoMensual > 0 ? formatearMoneda(montoMensual) : ''} 
                onChange={e => setMontoMensual(Number(e.target.value.replace(/\D/g, '')))} 
              />
            </div>
          </div>
        ) : (
          <div className="form-group">
            <label>Monto Mensual *</label>
            <input 
              type="text" 
              inputMode="numeric" 
              maxLength={8} 
              placeholder="₡0" 
              title="Formato colones CR: ₡1.234" 
              value={montoMensual > 0 ? formatearMoneda(montoMensual) : ''} 
              onChange={e => setMontoMensual(Number(e.target.value.replace(/\D/g, '')))} 
            />
          </div>
        )}

        <div className="form-row">
          <div className="form-group">
            <label>Fecha Inicio *</label>
            <input 
              type="date" 
              value={fechaInicio} 
              min={drawerMode === 'create' ? hoy : undefined}
              onChange={e => setFechaInicio(e.target.value)} 
            />
          </div>
          <div className="form-group">
            <label>Fecha Fin *</label>
            <input 
              type="date" 
              value={fechaFin} 
              min={fechaInicio || hoy}
              onChange={e => setFechaFin(e.target.value)} 
            />
          </div>
        </div>

        <div className="form-group">
          <label>Monto Depósito</label>
          <input 
            type="text" 
            inputMode="numeric" 
            maxLength={8} 
            placeholder="₡0" 
            title="Formato colones CR: ₡1.234" 
            value={montoDeposito > 0 ? formatearMoneda(montoDeposito) : ''} 
            onChange={e => setMontoDeposito(Number(e.target.value.replace(/\D/g, '')))} 
          />
        </div>

      </div>
    );
  };

  return (
    <>
      <PageHeader title="Contratos">
        <button className="btn-primary" onClick={() => openDrawer('create')}>
          <i className="fas fa-plus"></i> Nuevo contrato
        </button>
      </PageHeader>

      <div className="filters-bar">
        <div className="filter-group">
          <label>Buscar</label>
          <input 
            type="text" 
            placeholder="Residente..." 
            value={buscar} 
            onChange={e => setBuscar(e.target.value)} 
          />
        </div>
        <div className="filter-group">
          <label>Estado</label>
          <select value={filtroEstado} onChange={e => setFiltroEstado(e.target.value)}>
            <option value="">Todos</option>
            <option value="Activo">Activo</option>
            <option value="Finalizado">Finalizado</option>
          </select>
        </div>
      </div>

      <table className="table-modern">
        <thead>
          <tr>
            <th>Residente</th>
            <th>Departamento</th>
            <th>Fecha inicio</th>
            <th>Fecha fin</th>
            <th>Monto mensual</th>
            <th>Monto depósito</th>
            <th>Estado</th>
            <th>Acciones</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map(c => {
            const contractId = getItemProp(c, 'id_contrato') || getItemProp(c, 'id');
            const residenteNombre = getItemProp(c, 'nombre_residente') || getItemProp(c, 'residenteNombre') || getItemProp(c, 'residente') || '';

            return (
              <tr key={contractId}>
                <td data-label="Residente">{residenteNombre}</td>
                <td data-label="Departamento">{c.departamento}</td>
                <td data-label="Fecha inicio">{c.fecha_inicio}</td>
                <td data-label="Fecha fin">{c.fecha_fin}</td>
                <td data-label="Monto mensual">{formatearMoneda(c.monto_mensual ?? 0)}</td>
                <td data-label="Monto depósito">{formatearMoneda(c.monto_deposito ?? 0)}</td>
                <td data-label="Estado">
                  <span className={`badge ${c.estado === 'Activo' ? 'badge-success' : 'badge-warning'}`}>
                    {c.estado}
                  </span>
                </td>
                <td data-label="Acciones" className="action-icons">
                  <a onClick={() => openDrawer('view', c)} aria-label="Ver"><i className="fas fa-eye"></i></a>
                  <a onClick={() => openDrawer('edit', c)} aria-label="Editar"><i className="fas fa-edit"></i></a>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <Drawer
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title={drawerMode === 'create' ? 'Nuevo contrato' : drawerMode === 'edit' ? 'Editar contrato' : 'Ver contrato'}
        onSave={drawerMode === 'edit' ? handleEditSave : (drawerMode === 'create' ? handleCreateSave : undefined)}
        saveText={cargando ? 'Guardando...' : drawerMode === 'create' ? 'Crear' : 'Guardar'}
        size="md"
      >
        {renderDrawerContent()}
      </Drawer>
    </>
  );
}