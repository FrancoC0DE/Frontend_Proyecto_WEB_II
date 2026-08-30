/**
 * ============================================================================
 * Archivo: DepartamentosPage.tsx (Conectado a SQL Server via DataContext)
 * ============================================================================
 * Gestión de departamentos del condominio: crear, ver, editar, habilitar y
 * deshabilitar. El campo `estado` (Disponible/Ocupado) NO se edita: lo gestiona
 * el ciclo de vida del contrato (ocupación al crear contrato, liberación al
 * finalizar). El admin solo controla el `activo` (habilitar/deshabilitar).
 * ============================================================================
 */

import { useState, useCallback, useEffect } from 'react';
import PageHeader from '../../components/PageHeader';
import Drawer from '../../components/Drawer';
import Modal from '../../components/Modal';
import { useAlert } from '../../components/Alert';
import { useData } from '../../context/DataContext';
import type { Departamento } from '../../types';

export default function DepartamentosPage() {
  const {
    departamentosData,
    recargarDepartamentos,
    crearDepartamento,
    editarDepartamento,
    cambiarEstadoDepartamento,
    addActivity,
    addNotification
  } = useData();
  const { showAlert } = useAlert();

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerMode, setDrawerMode] = useState<'create' | 'view' | 'edit'>('create');
  const [selectedItem, setSelectedItem] = useState<Departamento | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [deleteItem, setDeleteItem] = useState<Departamento | null>(null);
  const [buscar, setBuscar] = useState('');
  const [filtroEstado, setFiltroEstado] = useState('');
  const [filtroActivo, setFiltroActivo] = useState('');

  // Estados del formulario
  const [numero, setNumero] = useState('');
  const [piso, setPiso] = useState<number | null>(null);
  const [metrosCuadrados, setMetrosCuadrados] = useState<number | null>(null);
  const [cargando, setCargando] = useState(false);

  // Auto-refresh cada 30s + al volver a enfocar la ventana
  useEffect(() => {
    const timer = setInterval(() => {
      void recargarDepartamentos();
    }, 30_000);

    const onFocus = () => {
      void recargarDepartamentos();
    };
    window.addEventListener('focus', onFocus);

    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', onFocus);
    };
  }, [recargarDepartamentos]);

  const resetForm = () => {
    setNumero('');
    setPiso(null);
    setMetrosCuadrados(null);
  };

  const openDrawer = (mode: 'create' | 'view' | 'edit', item?: Departamento) => {
    setDrawerMode(mode);
    setSelectedItem(item || null);

    if (mode === 'edit' && item) {
      setNumero(item.numero || '');
      setPiso(item.piso ?? null);
      setMetrosCuadrados(item.metros_cuadrados ?? null);
    } else if (mode === 'create') {
      resetForm();
    }

    setDrawerOpen(true);
  };

  const openDeleteModal = (item: Departamento) => {
    setDeleteItem(item);
    setModalOpen(true);
  };

  const filtered = departamentosData.filter(d => {
    if (buscar && !d.numero.toLowerCase().includes(buscar.toLowerCase())) return false;
    if (filtroEstado && d.estado !== filtroEstado) return false;
    if (filtroActivo) {
      const activo = d.activo ? 'Activo' : 'Inactivo';
      if (activo !== filtroActivo) return false;
    }
    return true;
  });

  const handleSave = useCallback(async () => {
    if (!numero.trim()) {
      showAlert('El número del departamento es obligatorio.');
      return;
    }

    try {
      setCargando(true);
      if (drawerMode === 'create') {
        const nuevoId = await crearDepartamento(numero.trim(), piso, metrosCuadrados);
        addActivity(`Nuevo departamento registrado: <strong>${numero.trim()}</strong>`, 'fa-door-open', 'var(--accent)');
        addNotification('admin', 'Nuevo departamento', `Se registró el departamento ${numero.trim()}.`, 'fa-door-open', nuevoId);
      } else if (drawerMode === 'edit' && selectedItem) {
        await editarDepartamento(selectedItem.id_departamento, numero.trim(), piso, metrosCuadrados);
        addActivity(`Departamento editado: <strong>${numero.trim()}</strong>`, 'fa-edit', 'var(--accent)');
        addNotification('admin', 'Departamento editado', `Se actualizó el departamento ${numero.trim()}.`, 'fa-edit', selectedItem.id_departamento);
      }

      setDrawerOpen(false);
      resetForm();
      showAlert(drawerMode === 'create' ? 'Departamento creado correctamente.' : 'Departamento actualizado correctamente.');
    } catch (err: unknown) {
      const error = err as Error;
      showAlert(`Error: ${error.message}`);
    } finally {
      setCargando(false);
    }
  }, [drawerMode, selectedItem, numero, piso, metrosCuadrados, crearDepartamento, editarDepartamento, addActivity, addNotification, showAlert]);

  const handleDelete = useCallback(async () => {
    if (!deleteItem) return;
    // Regla de negocio: un departamento OCUPADO no puede deshabilitarse
    // (defensa extra por si el modal se abre desde otro flujo).
    if (deleteItem.activo && deleteItem.estado === 'Ocupado') {
      showAlert('No se puede deshabilitar un departamento ocupado: tiene un contrato activo. Debes esperar a que finalice su contrato primero.', { tipo: 'warning', titulo: 'Acción no permitida' });
      setModalOpen(false);
      setDeleteItem(null);
      return;
    }
    const activar = !deleteItem.activo;

    try {
      await cambiarEstadoDepartamento(deleteItem.id_departamento, activar);

      if (!activar) {
        addActivity(`Departamento deshabilitado: <strong>${deleteItem.numero}</strong>`, 'fa-door-closed', 'var(--warning)');
        addNotification('admin', 'Departamento deshabilitado', `El departamento ${deleteItem.numero} fue deshabilitado.`, 'fa-door-closed', deleteItem.id_departamento);
      } else {
        addActivity(`Departamento habilitado: <strong>${deleteItem.numero}</strong>`, 'fa-user-check', 'var(--success)');
        addNotification('admin', 'Departamento habilitado', `El departamento ${deleteItem.numero} fue habilitado.`, 'fa-user-check', deleteItem.id_departamento);
      }

      setModalOpen(false);
      setDeleteItem(null);
    } catch (err: unknown) {
      const error = err as Error;
      showAlert(`Error: ${error.message}`);
    }
  }, [deleteItem, cambiarEstadoDepartamento, addActivity, addNotification, showAlert]);

  const renderDrawerContent = () => {
    if (drawerMode === 'view' && selectedItem) {
      return (
        <div className="detail-card">
          <div className="detail-row">
            <span className="detail-label">Número</span>
            <span className="detail-value">{selectedItem.numero}</span>
          </div>
          <div className="detail-row">
            <span className="detail-label">Piso</span>
            <span className="detail-value">{selectedItem.piso ?? '—'}</span>
          </div>
          <div className="detail-row">
            <span className="detail-label">Metros cuadrados</span>
            <span className="detail-value">{selectedItem.metros_cuadrados ?? '—'}</span>
          </div>
          <div className="detail-row">
            <span className="detail-label">Estado</span>
            <span className="detail-value">
              <span className={`badge ${selectedItem.estado === 'Disponible' ? 'badge-success' : 'badge-warning'}`}>
                {selectedItem.estado}
              </span>
            </span>
          </div>
          <div className="detail-row">
            <span className="detail-label">Registro</span>
            <span className="detail-value">
              <span className={`badge ${selectedItem.activo ? 'badge-success' : 'badge-warning'}`}>
                {selectedItem.activo ? 'Activo' : 'Inactivo'}
              </span>
            </span>
          </div>
        </div>
      );
    }

    return (
      <div className="form-section">
        <h4>{drawerMode === 'create' ? 'Información del Nuevo Departamento' : 'Editar Departamento'}</h4>

        <div className="form-group">
          <label>Número de departamento *</label>
          <input
            type="text"
            value={numero}
            onChange={e => setNumero(e.target.value)}
            placeholder="Ej: 3B, 101, 402"
            maxLength={20}
          />
        </div>

        <div className="form-row">
          <div className="form-group">
            <label>Piso</label>
            <input
              type="number"
              min="0"
              value={piso ?? ''}
              onChange={e => setPiso(e.target.value === '' ? null : Number(e.target.value))}
              placeholder="Ej: 3"
            />
          </div>
          <div className="form-group">
            <label>Metros cuadrados</label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={metrosCuadrados ?? ''}
              onChange={e => setMetrosCuadrados(e.target.value === '' ? null : Number(e.target.value))}
              placeholder="Ej: 85.50"
            />
          </div>
        </div>

        {drawerMode === 'create' && (
          <small className="form-hint">
            El estado nace 'Disponible'. La ocupación la gestiona el ciclo de vida del contrato.
          </small>
        )}
      </div>
    );
  };

  return (
    <>
      <PageHeader title="Departamentos">
        <button className="btn-primary" onClick={() => openDrawer('create')}>
          <i className="fas fa-plus"></i> Nuevo departamento
        </button>
      </PageHeader>

      <div className="filters-bar">
        <div className="filter-group">
          <label htmlFor="buscarDepartamento">Buscar</label>
          <input
            type="text"
            id="buscarDepartamento"
            placeholder="Número de departamento..."
            value={buscar}
            onChange={e => setBuscar(e.target.value)}
          />
        </div>
        <div className="filter-group">
          <label htmlFor="filtroEstadoDep">Ocupación</label>
          <select id="filtroEstadoDep" value={filtroEstado} onChange={e => setFiltroEstado(e.target.value)}>
            <option value="">Todos</option>
            <option value="Disponible">Disponible</option>
            <option value="Ocupado">Ocupado</option>
          </select>
        </div>
        <div className="filter-group">
          <label htmlFor="filtroActivoDep">Registro</label>
          <select id="filtroActivoDep" value={filtroActivo} onChange={e => setFiltroActivo(e.target.value)}>
            <option value="">Todos</option>
            <option value="Activo">Activo</option>
            <option value="Inactivo">Inactivo</option>
          </select>
        </div>
      </div>

      <table className="table-modern">
        <thead>
          <tr>
            <th>Número</th>
            <th>Piso</th>
            <th>Metros²</th>
            <th>Ocupación</th>
            <th>Registro</th>
            <th>Acciones</th>
          </tr>
        </thead>
        <tbody>
          {filtered.length === 0 ? (
            <tr>
              <td colSpan={6} style={{ textAlign: 'center', padding: 'var(--space-4)', color: 'var(--text-muted)' }}>
                No hay departamentos registrados.
              </td>
            </tr>
          ) : (
            filtered.map(d => (
              <tr key={d.id_departamento}>
                <td data-label="Número">{d.numero}</td>
                <td data-label="Piso">{d.piso ?? '—'}</td>
                <td data-label="Metros²">{d.metros_cuadrados ?? '—'}</td>
                <td data-label="Ocupación">
                  <span className={`badge ${d.estado === 'Disponible' ? 'badge-success' : 'badge-warning'}`}>
                    {d.estado}
                  </span>
                </td>
                <td data-label="Registro">
                  <span className={`badge ${d.activo ? 'badge-success' : 'badge-warning'}`}>
                    {d.activo ? 'Activo' : 'Inactivo'}
                  </span>
                </td>
                <td data-label="Acciones" className="action-icons">
                  <a onClick={() => openDrawer('view', d)} aria-label="Ver"><i className="fas fa-eye"></i></a>
                  <a onClick={() => openDrawer('edit', d)} aria-label="Editar"><i className="fas fa-edit"></i></a>
                  {d.activo ? (
                    d.estado === 'Ocupado' ? (
                      <a
                        onClick={() => showAlert('No se puede deshabilitar un departamento ocupado: tiene un contrato activo. Debes esperar a que finalice su contrato primero.', { tipo: 'warning', titulo: 'Acción no permitida' })}
                        aria-label="Deshabilitar (no permitido: ocupado)"
                        title="No se puede deshabilitar: tiene un contrato activo"
                        style={{ opacity: 0.45, cursor: 'not-allowed' }}
                      >
                        <i className="fas fa-trash-alt"></i>
                      </a>
                    ) : (
                      <a onClick={() => openDeleteModal(d)} aria-label="Deshabilitar">
                        <i className="fas fa-trash-alt"></i>
                      </a>
                    )
                  ) : (
                    <a onClick={() => openDeleteModal(d)} aria-label="Habilitar">
                      <i className="fas fa-user-check"></i>
                    </a>
                  )}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>

      <Drawer
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title={drawerMode === 'create' ? 'Nuevo departamento' : drawerMode === 'edit' ? 'Editar departamento' : 'Ver departamento'}
        onSave={drawerMode !== 'view' ? handleSave : undefined}
        saveText={cargando ? 'Guardando...' : drawerMode === 'create' ? 'Crear' : 'Guardar'}
        size="md"
      >
        {renderDrawerContent()}
      </Drawer>

      {deleteItem && (
        <Modal
          isOpen={modalOpen}
          onClose={() => { setModalOpen(false); setDeleteItem(null); }}
          title={deleteItem.activo ? 'Deshabilitar departamento' : 'Habilitar departamento'}
          message={deleteItem.activo
            ? `¿Estás seguro de que deseas deshabilitar el departamento ${deleteItem.numero}? No podrá asignarse a contratos nuevos.`
            : `¿Estás seguro de que deseas habilitar el departamento ${deleteItem.numero} nuevamente?`}
          confirmText={deleteItem.activo ? 'Deshabilitar' : 'Habilitar'}
          confirmClassName={deleteItem.activo ? 'btn-danger' : 'btn-enable'}
          onConfirm={handleDelete}
        />
      )}
    </>
  );
}
