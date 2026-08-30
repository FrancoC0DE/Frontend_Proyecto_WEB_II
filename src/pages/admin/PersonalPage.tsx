/**
 * ============================================================================
 * Archivo: PersonalPage.tsx
 * ============================================================================
 *
 * ¿Qué hace?
 * Pantalla de gestión de personal (empleados). Permite crear, ver, editar
 * y deshabilitar empleados. El rol se asigna automáticamente según el
 * dominio del correo (@admin.com, @guardia.com, etc.).
 *
 * Componentes que utiliza
 * - PageHeader (título y botón "Nuevo empleado")
 * - Drawer (formulario de creación/edición/visión detalle)
 * - Modal (confirmación para deshabilitar)
 * - useData (contexto: personalData, addActivity, addNotification)
 *
 * Flujo
 * 1. Admin hace clic en "Nuevo empleado" → Drawer con formulario
 * 2. Ingresa nombre, correo, teléfono, cédula y contraseña
 * 3. El dominio del correo determina el rol automáticamente
 * 4. Guarda → se agrega a la tabla y se registra en activityLog
 *
 * NOTA (cambio): el formulario usa estado controlado (useState) en lugar de
 * leer el DOM, de modo que los campos se limpian automáticamente al abrir el
 * drawer para crear otro empleado. El teléfono se formatea como 7777-7777 y
 * la cédula como #-###-##### (9 dígitos).
 * ============================================================================
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import PageHeader from '../../components/PageHeader';
import Drawer from '../../components/Drawer';
import Modal from '../../components/Modal';
import { useData } from '../../context/DataContext';
import { useAlert } from '../../components/Alert';
import { formatearTelefono, formatearCedula, validarTelefono, validarCedula, validarCorreoDominio } from '../../utils/formatters';
import type { Personal } from '../../types';

export default function PersonalPage() {
  const { personalData, recargarPersonal, addActivity, addNotification, crearPersonal, editarPersonal, cambiarEstadoPersonal } = useData();
  const { showAlert } = useAlert();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerMode, setDrawerMode] = useState<'create' | 'view' | 'edit'>('create');
  const [selectedItem, setSelectedItem] = useState<Personal | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [deleteItem, setDeleteItem] = useState<Personal | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [busqueda, setBusqueda] = useState('');
  const busquedaTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Búsqueda con debounce (500ms) — evita una petición por cada tecla
  useEffect(() => {
    if (busquedaTimerRef.current) clearTimeout(busquedaTimerRef.current);
    busquedaTimerRef.current = setTimeout(() => {
      recargarPersonal(busqueda);
    }, 500);
    return () => {
      if (busquedaTimerRef.current) clearTimeout(busquedaTimerRef.current);
    };
  }, [busqueda, recargarPersonal]);

  // Auto-refresh cada 30s + al volver a enfocar la ventana
  useEffect(() => {
    const timer = setInterval(() => {
      void recargarPersonal(busqueda);
    }, 30_000);

    const onFocus = () => {
      void recargarPersonal(busqueda);
    };
    window.addEventListener('focus', onFocus);

    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', onFocus);
    };
  }, [busqueda, recargarPersonal]);

  // Estado controlado del formulario (se limpia al abrir en modo crear)
  const [form, setForm] = useState({
    nombre: '',
    correo: '',
    correoContacto: '',
    telefono: '',
    cedula: '',
    contrasena: '',
    estado: 'Activo',
  });

  const setCampo = (campo: keyof typeof form, valor: string) => {
    setForm(prev => ({ ...prev, [campo]: valor }));
  };

  const resetForm = () => {
    setForm({ nombre: '', correo: '', correoContacto: '', telefono: '', cedula: '', contrasena: '', estado: 'Activo' });
  };

  const openDrawer = (mode: 'create' | 'view' | 'edit', item?: Personal) => {
    setDrawerMode(mode);
    setSelectedItem(item || null);
    setShowPassword(false);
    if (item) {
      // Edición / vista: precargar los datos del empleado
      setForm({
        nombre: item.nombre || '',
        correo: item.correo || '',
        correoContacto: item.correoContacto || '',
        telefono: item.telefono || '',
        cedula: item.cedula || '',
        contrasena: '',
        estado: item.estado || 'Activo',
      });
    } else {
      // Crear: formulario limpio
      resetForm();
    }
    setDrawerOpen(true);
  };

  const openDeleteModal = (item: Personal) => {
    setDeleteItem(item);
    setModalOpen(true);
  };

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
          // El correo de contacto (2FA) es opcional, pero si se escribe debe
          // tener un dominio público real (gmail/hotmail/outlook/yahoo).
          if (form.correoContacto.trim()) {
              const errorCorreoContacto = validarCorreoDominio(form.correoContacto);
              if (errorCorreoContacto) {
                  showAlert(errorCorreoContacto);
                  return;
              }
          }
      }

      try {
          if (drawerMode === 'create') {
              if (!form.contrasena) {
                  showAlert('Ingrese una contraseña para el nuevo empleado.');
                  return;
              }
              const nuevoId = await crearPersonal(form.nombre, form.correo, form.contrasena, form.telefono, form.cedula, form.correoContacto);
              addActivity(`Nuevo empleado registrado: <strong>${form.nombre}</strong>`, 'fa-user-plus', 'var(--success)');
              addNotification('admin', 'Nuevo empleado', `Se registró a ${form.nombre} como empleado.`, 'fa-user-plus', nuevoId);
          } else if (drawerMode === 'edit' && selectedItem) {
              await editarPersonal(selectedItem.id_usuario, form.nombre, form.correo, form.telefono, form.cedula, form.correoContacto);
              // NOTA (cambio): el select de Estado del formulario ahora sí se aplica.
              // Si el admin cambió el estado en la edición, se usa el mismo endpoint
              // que el botón de deshabilitar/habilitar (sp_Personal_Desactivar/Reactivar).
              if (form.estado !== (selectedItem.estado || 'Activo')) {
                  await cambiarEstadoPersonal(selectedItem.id_usuario, form.estado === 'Activo');
              }
              addActivity(`Empleado editado: <strong>${form.nombre}</strong>`, 'fa-edit', 'var(--accent)');
              addNotification('admin', 'Empleado editado', `Se actualizó la información de ${form.nombre}.`, 'fa-edit', selectedItem.id_usuario);
          }

          setDrawerOpen(false);
          resetForm();
          showAlert('Datos guardados correctamente.');
      } catch (error: unknown) {
          const err = error as Error;
          showAlert(`Error: ${err.message}`);
      }
  }, [drawerMode, selectedItem, form, crearPersonal, editarPersonal, cambiarEstadoPersonal, addActivity, addNotification, showAlert]);

  const handleDelete = useCallback(async () => {
      if (!deleteItem) return;

      const activar = deleteItem.estado !== 'Activo'; // si está inactivo, lo activamos

      try {
          await cambiarEstadoPersonal(deleteItem.id_usuario, activar);

          if (!activar) {
              addActivity(`Empleado deshabilitado: <strong>${deleteItem.nombre}</strong>`, 'fa-user-slash', 'var(--warning)');
              addNotification('admin', 'Empleado deshabilitado', `${deleteItem.nombre} ha sido deshabilitado.`, 'fa-user-slash', deleteItem.id_usuario);
          } else {
              addActivity(`Empleado habilitado: <strong>${deleteItem.nombre}</strong>`, 'fa-user-check', 'var(--success)');
              addNotification('admin', 'Empleado habilitado', `${deleteItem.nombre} ha sido habilitado.`, 'fa-user-check', deleteItem.id_usuario);
          }
      } catch (error: unknown) {
          const err = error as Error;
          showAlert(`Error: ${err.message}`);
      }

      setModalOpen(false);
      setDeleteItem(null);
  }, [deleteItem, cambiarEstadoPersonal, addActivity, addNotification, showAlert]);

  const renderDrawerContent = () => {
    if (drawerMode === 'view' && selectedItem) {
      return (
        <div className="detail-card">
          <div className="detail-row">
            <span className="detail-label">Nombre</span>
            <span className="detail-value">{selectedItem.nombre}</span>
          </div>
          <div className="detail-row">
            <span className="detail-label">Correo</span>
            <span className="detail-value">{selectedItem.correo}</span>
          </div>
          <div className="detail-row">
            <span className="detail-label">Correo 2FA</span>
            <span className="detail-value">{selectedItem.correoContacto || 'Sin configurar'}</span>
          </div>
          <div className="detail-row">
            <span className="detail-label">Teléfono</span>
            <span className="detail-value">{selectedItem.telefono}</span>
          </div>
          <div className="detail-row">
            <span className="detail-label">Cédula</span>
            <span className="detail-value">{selectedItem.cedula}</span>
          </div>
          <div className="detail-row">
            <span className="detail-label">Dominio</span>
            <span className="detail-value">{selectedItem.dominio}</span>
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
              <input
                type="text"
                value={form.nombre}
                onChange={e => setCampo('nombre', e.target.value)}
                placeholder="Nombre completo"
              />
            </div>
            <div className="form-group">
              <label>Correo electrónico</label>
              <input
                type="email"
                value={form.correo}
                onChange={e => setCampo('correo', e.target.value)}
                placeholder="correo@dominio.com"
              />
            </div>
          </div>
          <div className="form-group">
            <label>Correo secundario (2FA)</label>
            <input
              type="email"
              value={form.correoContacto}
              onChange={e => setCampo('correoContacto', e.target.value)}
              placeholder="correo real para recibir el código 2FA"
            />
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Teléfono</label>
              <input
                type="tel"
                value={form.telefono}
                onChange={e => setCampo('telefono', formatearTelefono(e.target.value))}
                placeholder="7777-7777"
                maxLength={9}
              />
            </div>
            <div className="form-group">
              <label>Documento de identidad</label>
              <input
                type="text"
                value={form.cedula}
                onChange={e => setCampo('cedula', formatearCedula(e.target.value))}
                placeholder="1-2345-6789"
                maxLength={11}
              />
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
                  placeholder="Contraseña del empleado"
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
              <small className="form-hint">El empleado usará esta contraseña para iniciar sesión con su correo.</small>
            </div>
          )}
        </div>
        <div className="form-section">
          <h4>Estado</h4>
          <div className="form-group">
            <label>Estado</label>
            <select value={form.estado} onChange={e => setCampo('estado', e.target.value)}>
              <option value="Activo">Activo</option>
              <option value="Inactivo">Inactivo</option>
            </select>
          </div>
        </div>
      </>
    );
  };

  return (
    <>
      <PageHeader title="Personal">
        <button className="btn-primary" onClick={() => openDrawer('create')}>
          <i className="fas fa-plus"></i> Nuevo empleado
        </button>
      </PageHeader>

      <div className="card" style={{ marginBottom: 'var(--space-4)' }}>
        <p><strong>Dominios permitidos:</strong> El rol se asigna automáticamente según el dominio del correo.</p>
        <div style={{ marginTop: 'var(--space-2)' }}>
          <span className="badge badge-domain">@admin.com → Administrador</span>
          <span className="badge badge-domain">@guardia.com → Guarda</span>
        </div>
      </div>

      <div className="visitas-filters">
        <div className="filter-group">
          <label htmlFor="personalSearch">Buscar</label>
          <input
            type="text"
            id="personalSearch"
            placeholder="Nombre o cédula..."
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
          />
        </div>
        {busqueda && (
          <button className="btn-secondary" onClick={() => setBusqueda('')}>
            <i className="fas fa-undo"></i> Limpiar
          </button>
        )}
      </div>

      <table className="table-modern">
        <thead>
          <tr>
            <th>Foto</th><th>Nombre</th><th>Correo</th><th>Dominio</th><th>Estado</th><th>Acciones</th>
          </tr>
        </thead>
        <tbody>
          {personalData.map(p => (
            <tr key={p.id_usuario}>
              <td data-label="Foto"><span className="avatar-placeholder">{p.iniciales}</span></td>
              <td data-label="Nombre">{p.nombre}</td>
              <td data-label="Correo">{p.correo}</td>
              <td data-label="Dominio"><span className="badge badge-domain">{p.dominio}</span></td>
              <td data-label="Estado">
                <span className={`badge ${p.estado === 'Activo' ? 'badge-success' : 'badge-warning'}`}>
                  {p.estado}
                </span>
              </td>
              <td data-label="Acciones" className="action-icons">
                <a onClick={() => openDrawer('view', p)} aria-label="Ver"><i className="fas fa-eye"></i></a>
                <a onClick={() => openDrawer('edit', p)} aria-label="Editar"><i className="fas fa-edit"></i></a>
                {p.estado === 'Activo' ? (
                    <a onClick={() => openDeleteModal(p)} aria-label="Deshabilitar">
                        <i className="fas fa-trash-alt"></i>
                    </a>
                ) : (
                    <a onClick={() => openDeleteModal(p)} aria-label="Habilitar">
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
        title={drawerMode === 'create' ? 'Nuevo empleado' : drawerMode === 'edit' ? 'Editar empleado' : 'Ver empleado'}
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
          // NOTA (cambio): el modal ahora es dinámico según el estado del empleado.
          // Si está Activo → confirma deshabilitar; si está Inactivo → confirma habilitar.
          title={deleteItem.estado === 'Activo' ? 'Deshabilitar empleado' : 'Habilitar empleado'}
          message={deleteItem.estado === 'Activo'
            ? `¿Estás seguro de que deseas deshabilitar a ${deleteItem.nombre}? El empleado quedará inactivo en el sistema.`
            : `¿Estás seguro de que deseas habilitar a ${deleteItem.nombre} nuevamente? El empleado podrá volver a iniciar sesión en el sistema.`}
          confirmText={deleteItem.estado === 'Activo' ? 'Deshabilitar' : 'Habilitar'}
          // NOTA (cambio): el botón "Habilitar" usa la clase btn-enable de admin.css
          // (misma estructura que btn-danger pero en verde), en vez de btn-success de
          // guarda.css que no tenía estructura de botón de modal.
          confirmClassName={deleteItem.estado === 'Activo' ? 'btn-danger' : 'btn-enable'}
          onConfirm={handleDelete}
        />
      )}
    </>
  );
}
