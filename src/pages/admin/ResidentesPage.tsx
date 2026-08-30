/**
 * ============================================================================
 * Archivo: ResidentesPage.tsx (Conectado a SQL Server via DataContext)
 * ============================================================================
 */

import { useState, useCallback, useEffect } from 'react';
import PageHeader from '../../components/PageHeader';
import Drawer from '../../components/Drawer';
import Modal from '../../components/Modal';
import { useData } from '../../context/DataContext';
import { useAlert } from '../../components/Alert';
import { formatearTelefono, formatearCedula, validarTelefono, validarCedula, validarCorreoDominio } from '../../utils/formatters';
import type { Residente } from '../../types';

export default function ResidentesPage() {
  const { 
    residentesData, 
    recargarResidentes,
    crearResidente, 
    editarResidente, 
    cambiarEstadoResidente, 
    addActivity, 
    addNotification 
  } = useData();
  const { showAlert } = useAlert();

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerMode, setDrawerMode] = useState<'create' | 'view' | 'edit'>('create');
  const [selectedItem, setSelectedItem] = useState<Residente | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [deleteItem, setDeleteItem] = useState<Residente | null>(null);
  const [buscar, setBuscar] = useState('');
  const [filtroContrato, setFiltroContrato] = useState('');
  const [filtroEstado, setFiltroEstado] = useState('');

  // Estados para controlar el formulario (se limpian al abrir en modo crear)
  const [form, setForm] = useState({
    nombre: '',
    correo: '',
    telefono: '',
    cedula: '',
    contrasena: '',
    estado: 'Activo',
  });
  const [showPassword, setShowPassword] = useState(false);

  // Auto-refresh cada 30s + al volver a enfocar la ventana
  useEffect(() => {
    const timer = setInterval(() => {
      void recargarResidentes();
    }, 30_000);

    const onFocus = () => {
      void recargarResidentes();
    };
    window.addEventListener('focus', onFocus);

    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', onFocus);
    };
  }, [recargarResidentes]);

  const setCampo = (campo: keyof typeof form, valor: string) => {
    setForm(prev => ({ ...prev, [campo]: valor }));
  };

  const resetForm = () => {
    setForm({ nombre: '', correo: '', telefono: '', cedula: '', contrasena: '', estado: 'Activo' });
  };

  const filtered = residentesData.filter(r => {
    if (buscar && !r.nombre.toLowerCase().includes(buscar.toLowerCase()) && !r.departamento.toLowerCase().includes(buscar.toLowerCase())) return false;
    if (filtroContrato && r.contrato_estado !== filtroContrato) return false;
    if (filtroEstado && r.estado !== filtroEstado) return false;
    return true;
  });

  const openDrawer = (mode: 'create' | 'view' | 'edit', item?: Residente) => {
    setDrawerMode(mode);
    setSelectedItem(item || null);
    setShowPassword(false);

    if (item) {
      setForm({
        nombre: item.nombre || '',
        correo: item.correo || '',
        telefono: item.telefono || '',
        cedula: item.cedula || '',
        contrasena: '',
        estado: item.estado || 'Activo',
      });
    } else {
      // Crear: formulario limpio para crear varios residentes sin datos viejos
      resetForm();
    }

    setDrawerOpen(true);
  };

  const openDeleteModal = (item: Residente) => {
    setDeleteItem(item);
    setModalOpen(true);
  };

  // Guardar (POST o PUT a SQL Server)
  const handleSave = useCallback(async () => {
    // Validación de formato SOLO al crear (el admin escribe el valor nuevo y las
    // máscaras garantizan el formato). Al editar no se bloquea: los registros
    // viejos pueden estar en un formato anterior y deben poder guardarse.
    if (drawerMode === 'create') {
      const errorTelefono = validarTelefono(form.telefono);
      if (errorTelefono) {
        showAlert(errorTelefono);
        return;
      }
      const errorCedula = validarCedula(form.cedula);
      if (errorCedula) {
        showAlert(errorCedula);
        return;
      }
      // El nombre no puede ser solo números
      if (!/[a-zA-ZáéíóúñÑ]/.test(form.nombre.trim())) {
        showAlert('El nombre debe contener letras (no solo números).');
        return;
      }
      // El correo debe ser de un dominio público permitido
      const errorCorreo = validarCorreoDominio(form.correo);
      if (errorCorreo) {
        showAlert(errorCorreo);
        return;
      }
    }

    try {
      if (drawerMode === 'create') {
        if (!form.nombre.trim() || !form.correo.trim()) {
          showAlert('Por favor ingrese al menos el nombre y correo');
          return;
        }
        if (!form.contrasena) {
          showAlert('Ingrese una contraseña para el nuevo residente.');
          return;
        }

        // Llamada a la API de SQL Server (contraseña real, sin valores fijos)
        const nuevoId = await crearResidente(form.nombre, form.correo, form.contrasena, form.telefono, form.cedula);
        addActivity(`Nuevo residente registrado: <strong>${form.nombre}</strong>`, 'fa-user-plus', 'var(--success)');
        addNotification('admin', 'Nuevo residente', `Se registró a ${form.nombre} como residente.`, 'fa-user-plus', nuevoId);
        showAlert('Residente insertado con éxito en la Base de Datos.');
      } else if (drawerMode === 'edit' && selectedItem) {
        // Llamada a la API de edición
        await editarResidente(selectedItem.id, form.nombre, form.correo, form.telefono, form.cedula);
        
        // Si cambió el estado
        const estaActivo = form.estado === 'Activo';
        if ((selectedItem.estado === 'Activo') !== estaActivo) {
          await cambiarEstadoResidente(selectedItem.id, estaActivo);
        }

        addActivity(`Residente editado: <strong>${form.nombre}</strong>`, 'fa-edit', 'var(--accent)');
        addNotification('admin', 'Residente editado', `Se actualizó la información de ${form.nombre}.`, 'fa-edit', selectedItem.id);
        showAlert('Residente actualizado con éxito.');
      }

      setDrawerOpen(false);
      resetForm();
    } catch (err: unknown) {
      console.error('Error al guardar en la BD:', err);
      showAlert(`Error al guardar en SQL Server: ${err instanceof Error ? err.message : String(err)}`);
    }
  }, [drawerMode, selectedItem, form, crearResidente, editarResidente, cambiarEstadoResidente, addActivity, addNotification, showAlert]);

  // Cambiar estado (Deshabilitar / Reactivar en SQL Server)
  const handleDelete = useCallback(async () => {
    if (!deleteItem) return;
    try {
      const activar = deleteItem.estado !== 'Activo';
      await cambiarEstadoResidente(deleteItem.id, activar);

      if (!activar) {
        addActivity(`Residente deshabilitado: <strong>${deleteItem.nombre}</strong>`, 'fa-user-slash', 'var(--warning)');
        addNotification('admin', 'Residente deshabilitado', `${deleteItem.nombre} ha sido deshabilitado.`, 'fa-user-slash', deleteItem.id);
      } else {
        addActivity(`Residente habilitado: <strong>${deleteItem.nombre}</strong>`, 'fa-user-check', 'var(--success)');
        addNotification('admin', 'Residente habilitado', `${deleteItem.nombre} ha sido habilitado.`, 'fa-user-check', deleteItem.id);
      }

      setModalOpen(false);
      setDeleteItem(null);
    } catch (err: unknown) {
      console.error('Error cambiando estado:', err);
      showAlert(`Error al cambiar el estado: ${err instanceof Error ? err.message : String(err)}`);
    }
  }, [deleteItem, cambiarEstadoResidente, addActivity, addNotification, showAlert]);

  const renderDrawerContent = () => {
    if (drawerMode === 'view' && selectedItem) {
      return (
        <div className="detail-card">
          <div className="detail-row">
            <span className="detail-label">Nombre</span>
            <span className="detail-value">{selectedItem.nombre}</span>
          </div>
          <div className="detail-row">
            <span className="detail-label">Documento de identidad</span>
            <span className="detail-value">{selectedItem.cedula || '—'}</span>
          </div>
          <div className="detail-row">
            <span className="detail-label">Departamento</span>
            <span className="detail-value">{selectedItem.departamento}</span>
          </div>
          <div className="detail-row">
            <span className="detail-label">Correo</span>
            <span className="detail-value">{selectedItem.correo}</span>
          </div>
          <div className="detail-row">
            <span className="detail-label">Teléfono</span>
            <span className="detail-value">{selectedItem.telefono}</span>
          </div>
          <div className="detail-row">
            <span className="detail-label">Contrato</span>
            <span className="detail-value">
              <span className={`badge ${selectedItem.contrato_estado === 'Activo' ? 'badge-success' : 'badge-warning'}`}>
                {selectedItem.contrato_estado}
              </span>
            </span>
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
      <>
        <div className="form-section">
          <h4>Información General</h4>
          <div className="form-row">
            <div className="form-group">
              <label>Nombre completo</label>
              <input type="text" value={form.nombre} onChange={e => setCampo('nombre', e.target.value)} placeholder="Nombre completo" />
            </div>
            <div className="form-group">
              <label>Cédula</label>
              <input type="text" value={form.cedula} onChange={e => setCampo('cedula', formatearCedula(e.target.value))} placeholder="1-2345-6789" maxLength={11} />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Correo</label>
              <input type="email" value={form.correo} onChange={e => setCampo('correo', e.target.value)} placeholder="correo@email.com" />
            </div>
            <div className="form-group">
              <label>Teléfono</label>
              <input type="tel" value={form.telefono} onChange={e => setCampo('telefono', formatearTelefono(e.target.value))} placeholder="7777-7777" maxLength={9} />
            </div>
          </div>
          {drawerMode === 'create' && (
            <div className="form-group">
              <label>Contraseña</label>
              <div className="password-field">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={form.contrasena}
                  onChange={e => setCampo('contrasena', e.target.value)}
                  placeholder="Contraseña del residente"
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  className="password-toggle"
                  aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                  onClick={() => setShowPassword(v => !v)}
                >
                  <i className={`fas ${showPassword ? 'fa-eye-slash' : 'fa-eye'}`}></i>
                </button>
              </div>
              <small className="form-hint">El residente usará esta contraseña para iniciar sesión con su correo.</small>
            </div>
          )}
        </div>
        {drawerMode === 'edit' && (
          <div className="form-section">
            <h4>Estado</h4>
            <div className="form-group">
              <label>Estado del residente</label>
              <select value={form.estado} onChange={e => setCampo('estado', e.target.value)}>
                <option value="Activo">Activo</option>
                <option value="Inactivo">Inactivo</option>
              </select>
            </div>
          </div>
        )}
      </>
    );
  };

  return (
    <>
      <PageHeader title="Residentes">
        <button className="btn-primary" onClick={() => openDrawer('create')}>
          <i className="fas fa-plus"></i> Nuevo residente
        </button>
      </PageHeader>

      <div className="filters-bar">
        <div className="filter-group">
          <label htmlFor="buscarResidente">Buscar</label>
          <input type="text" id="buscarResidente" placeholder="Nombre, departamento..." value={buscar} onChange={e => setBuscar(e.target.value)} />
        </div>
        <div className="filter-group">
          <label htmlFor="filtroContrato">Contrato</label>
          <select id="filtroContrato" value={filtroContrato} onChange={e => setFiltroContrato(e.target.value)}>
            <option value="">Todos</option>
            <option>Activo</option>
            <option>Vencido</option>
            <option>Sin Contrato</option>
          </select>
        </div>
        <div className="filter-group">
          <label htmlFor="filtroEstadoRes">Estado</label>
          <select id="filtroEstadoRes" value={filtroEstado} onChange={e => setFiltroEstado(e.target.value)}>
            <option value="">Todos</option>
            <option>Activo</option>
            <option>Inactivo</option>
          </select>
        </div>
      </div>

      <table className="table-modern">
        <thead>
          <tr><th>Nombre</th><th>Departamento</th><th>Correo</th><th>Estado</th><th>Acciones</th></tr>
        </thead>
        <tbody>
          {filtered.map(r => (
            <tr key={r.id}>
              <td data-label="Nombre">{r.nombre}</td>
              <td data-label="Departamento">{r.departamento}</td>
              <td data-label="Correo">{r.correo}</td>
              <td data-label="Estado">
                <span className={`badge ${r.estado === 'Activo' ? 'badge-success' : 'badge-warning'}`}>
                  {r.estado}
                </span>
              </td>
              <td data-label="Acciones" className="action-icons">
                <a onClick={() => openDrawer('view', r)} aria-label="Ver"><i className="fas fa-eye"></i></a>
                <a onClick={() => openDrawer('edit', r)} aria-label="Editar"><i className="fas fa-edit"></i></a>
                {r.estado === 'Activo' ? (
                  <a onClick={() => openDeleteModal(r)} aria-label="Deshabilitar">
                    <i className="fas fa-trash-alt"></i>
                  </a>
                ) : (
                  // NOTA (cambio): botón para habilitar residentes inactivos,
                  // mismo patrón que Personal (modal dinámico Habilitar/Deshabilitar).
                  <a onClick={() => openDeleteModal(r)} aria-label="Habilitar">
                    <i className="fas fa-user-check"></i>
                  </a>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <Drawer
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title={drawerMode === 'create' ? 'Nuevo residente' : drawerMode === 'edit' ? 'Editar residente' : 'Ver residente'}
        onSave={drawerMode !== 'view' ? handleSave : undefined}
        saveText={drawerMode === 'create' ? 'Crear' : 'Guardar'}
        size="md"
      >
        {renderDrawerContent()}
      </Drawer>

      {deleteItem && (
        <Modal
          isOpen={modalOpen}
          onClose={() => { setModalOpen(false); setDeleteItem(null); }}
          // NOTA (cambio): modal dinámico según el estado del residente.
          // Activo → confirma deshabilitar; Inactivo → confirma habilitar (btn-enable).
          title={deleteItem.estado === 'Activo' ? 'Deshabilitar residente' : 'Habilitar residente'}
          message={deleteItem.estado === 'Activo'
            ? `¿Estás seguro de que deseas deshabilitar a ${deleteItem.nombre}? El residente quedará inactivo en el sistema.`
            : `¿Estás seguro de que deseas habilitar a ${deleteItem.nombre} nuevamente? El residente podrá volver a iniciar sesión en el sistema.`}
          confirmText={deleteItem.estado === 'Activo' ? 'Deshabilitar' : 'Habilitar'}
          confirmClassName={deleteItem.estado === 'Activo' ? 'btn-danger' : 'btn-enable'}
          onConfirm={handleDelete}
        />
      )}
    </>
  );
}