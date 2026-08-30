/**
 * ============================================================================
 * Archivo: AreasPage.tsx
 * ============================================================================
 *
 * ¿Qué hace?
 * Pantalla de administración de áreas comunes conectada al backend real
 * (GET/POST/PUT/PATCH en /api/areas vía areaServices). Permite crear, editar,
 * habilitar y deshabilitar áreas (Salón Social, Piscina, Gimnasio, etc.), con
 * subida de imagen por archivo o URL (misma lógica que las fotos de perfil).
 *
 * La lista viene de sp_ListarAreasComunes (API real).
 *
 * Componentes que utiliza
 * - PageHeader, Drawer, Modal, useAlert
 * - areaServices (getAreas, createArea, updateArea, toggleEstadoArea,
 *   buildAreaImageUrl)
 *
 * Flujo
 * 1. Al montar carga las áreas desde la API.
 * 2. "Agregar área" → Drawer con formulario controlado (nombre, capacidad,
 *    horario, costo, reservas/semana, imagen por archivo o URL).
 * 3. Guardar → sp_CrearAreaComun / sp_ActualizarAreaComun (multipart).
 * 4. Deshabilitar/Habilitar → Modal de confirmación → sp_Desactivar/Activar.
 *
 * ============================================================================
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import PageHeader from '../../components/PageHeader';
import Drawer from '../../components/Drawer';
import Modal from '../../components/Modal';
import { useData } from '../../context/DataContext';
import { useAlert } from '../../components/Alert';
import { formatHora, formatHoraAMPM, toTimeOnly } from '../../hooks/useLocalDate';
import { formatearMoneda } from '../../utils/formatters';
import {
  getAreas, createArea, updateArea, toggleEstadoArea,
  buildAreaImageUrl, type AreaComun, type VentanaMantenimiento
} from '../../services/areaServices';

const IMAGEN_PLACEHOLDER = '/img/area-placeholder.svg';

interface FormArea {
  nombre: string;
  descripcion: string;
  capacidad_max: string;
  hora_apertura: string;
  hora_cierre: string;
  costo_por_hora: string;
  max_reservas_semana: string;
  imagenUrl: string;
  imagenUrlAplicada: string;
  imagenArchivo: File | null;
  /** Ventanas de mantenimiento: franjas en las que el área queda bloqueada. */
  mantenimiento: VentanaMantenimiento[];
}

const FORM_VACIO: FormArea = {
  nombre: '', descripcion: '', capacidad_max: '',
  hora_apertura: '08:00', hora_cierre: '22:00',
  costo_por_hora: '', max_reservas_semana: '2',
  imagenUrl: '', imagenUrlAplicada: '', imagenArchivo: null,
  mantenimiento: [],
};

/**
 * Normaliza la hora a "HH:mm" para <input type="time"> y formatHora.
 * SQL Server serializa las columnas TIME como ISO ("1970-01-01T13:00:00.000Z"),
 * pero también pueden llegar como "08:00" o "08:00:00": toTimeOnly las
 * convierte todas a "HH:mm[:ss]" (o Date → componentes UTC).
 */
const formatearHoraInput = (valor: unknown): string => {
  if (!valor) return '';
  if (valor instanceof Date) {
    const h = String(valor.getUTCHours()).padStart(2, '0');
    const m = String(valor.getUTCMinutes()).padStart(2, '0');
    return `${h}:${m}`;
  }
  const texto = String(valor).trim();
  if (!texto) return '';
  return toTimeOnly(texto).slice(0, 5);
};

/** Horas en punto de todo el día (00:00 – 23:00) para los selectores de hora. */
const HORAS_ENTERAS = Array.from({ length: 24 }, (_, h) => `${String(h).padStart(2, '0')}:00`);

/**
 * Ajusta un valor "HH:mm" a la hora EN PUNTO (08:30 → 08:00). Se aplica al
 * cargar un área en el formulario, por si quedaron horas con minutos guardadas
 * de antes: los selectores solo ofrecen horas completas (las reservas se
 * cobran por horas enteras —sp_CrearReservaPago— y los bloques ocupados se
 * comparan por hora en punto —sp_ListarHorariosDisponibles—).
 */
const aHoraEntera = (valor: string): string => {
  const hora = (valor || '').slice(0, 2);
  return hora ? `${hora}:00` : '';
};

/**
 * Traduce los mensajes de error devueltos por los SPs (constraints, UNIQUE,
 * trigger, RAISERROR) a textos amigables (spec §2). Si no coincide, se muestra
 * el mensaje original del backend.
 */
const mensajeErrorAmigable = (error: unknown): string => {
  const msg = error instanceof Error ? error.message : String(error);
  const m = msg.toLowerCase();
  // Orden: primero los patrones específicos, luego los genéricos, para evitar
  // que un mensaje de permisos que mencione "reservas" caiga en el mapeo erróneo.
  if (/ya existe/.test(m) || m.includes('duplicate') || m.includes('uq_area')) {
    return 'Ya existe un área con ese nombre.';
  }
  if (m.includes('permiso') || m.includes('autorizad') || m.includes('forbidden') || /solo.*admin/.test(m)) {
    return 'Solo los administradores pueden gestionar áreas comunes.';
  }
  if (/reservas futuras/.test(m) || m.includes('trg_area')) {
    return 'No se puede reducir el horario porque existen reservas futuras fuera del nuevo rango.';
  }
  if (m.includes('cierre') || (m.includes('ck_area') && m.includes('hora'))) {
    return 'La hora de cierre debe ser mayor que la hora de apertura.';
  }
  if (m.includes('capacidad')) return 'La capacidad máxima debe ser al menos 1.';
  if (m.includes('costo')) return 'El costo por hora no puede ser negativo.';
  if (m.includes('max_reservas') || m.includes('reservas semanales')) {
    return 'El máximo de reservas semanales debe ser al menos 1.';
  }
  return msg;
};

export default function AreasPage() {
  const { addActivity, addNotification } = useData();
  const { showAlert } = useAlert();

  const [areas, setAreas] = useState<AreaComun[]>([]);
  const [cargando, setCargando] = useState(true);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerMode, setDrawerMode] = useState<'create' | 'edit'>('create');
  const [editandoArea, setEditandoArea] = useState<AreaComun | null>(null);
  const [quitarImagen, setQuitarImagen] = useState(false);
  // URL de vista previa del archivo seleccionado (se libera con revokeObjectURL)
  const [archivoPreview, setArchivoPreview] = useState('');
  // Ref para liberar la URL de vista previa si el componente se desmonta con un archivo activo.
  const archivoPreviewRef = useRef('');

  useEffect(() => { archivoPreviewRef.current = archivoPreview; }, [archivoPreview]);
  useEffect(() => () => {
    if (archivoPreviewRef.current) URL.revokeObjectURL(archivoPreviewRef.current);
  }, []);

  const [toggleArea, setToggleArea] = useState<AreaComun | null>(null);

  const [form, setForm] = useState<FormArea>(FORM_VACIO);

  const setCampo = (campo: keyof FormArea, valor: string) =>
    setForm(prev => ({ ...prev, [campo]: valor }));

  // --- Ventanas de mantenimiento ---
  const agregarVentana = () =>
    setForm(prev => ({ ...prev, mantenimiento: [...prev.mantenimiento, { hora_inicio: '', hora_fin: '', descripcion: '' }] }));

  const quitarVentana = (indice: number) =>
    setForm(prev => ({ ...prev, mantenimiento: prev.mantenimiento.filter((_, i) => i !== indice) }));

  const actualizarVentana = (indice: number, cambios: Partial<VentanaMantenimiento>) =>
    setForm(prev => ({
      ...prev,
      mantenimiento: prev.mantenimiento.map((v, i) => (i === indice ? { ...v, ...cambios } : v)),
    }));

  const resetForm = () => {
    setForm(FORM_VACIO);
    setQuitarImagen(false);
    if (archivoPreview) URL.revokeObjectURL(archivoPreview);
    setArchivoPreview('');
  };

  const cargarAreas = useCallback(async () => {
    setCargando(true);
    try {
      const data = await getAreas();
      setAreas(Array.isArray(data) ? data : []);
    } catch (error) {
      showAlert(mensajeErrorAmigable(error), { titulo: 'Error', tipo: 'error' });
      setAreas([]);
    } finally {
      setCargando(false);
    }
  }, [showAlert]);

  useEffect(() => { cargarAreas(); }, [cargarAreas]);

  const openCreate = () => {
    setDrawerMode('create');
    setEditandoArea(null);
    resetForm();
    setDrawerOpen(true);
  };

  const openEdit = (area: AreaComun) => {
    setDrawerMode('edit');
    setEditandoArea(area);
    setQuitarImagen(false);
    setForm({
      nombre: area.nombre || '',
      descripcion: area.descripcion || '',
      capacidad_max: area.capacidad_max != null ? String(area.capacidad_max) : '',
      hora_apertura: aHoraEntera(formatearHoraInput(area.hora_apertura)),
      hora_cierre: aHoraEntera(formatearHoraInput(area.hora_cierre)),
      costo_por_hora: area.costo_por_hora != null ? String(area.costo_por_hora) : '',
      max_reservas_semana: area.max_reservas_semana != null ? String(area.max_reservas_semana) : '2',
      imagenUrl: '',
      imagenUrlAplicada: '',
      imagenArchivo: null,
      mantenimiento: (area.mantenimiento ?? []).map(m => ({
        hora_inicio: aHoraEntera(formatearHoraInput(m.hora_inicio)),
        hora_fin: aHoraEntera(formatearHoraInput(m.hora_fin)),
        descripcion: m.descripcion ?? '',
      })),
    });
    if (archivoPreview) URL.revokeObjectURL(archivoPreview);
    setArchivoPreview('');
    setDrawerOpen(true);
  };

  /** Aplica la URL escrita en el input como imagen del área (con vista previa). */
  const aplicarUrl = () => {
    const url = form.imagenUrl.trim();
    if (!url) {
      showAlert('Pegue la URL de la imagen antes de aplicarla.');
      return;
    }
    if (!/^https?:\/\//i.test(url)) {
      showAlert('La URL debe comenzar con http:// o https://');
      return;
    }
    if (archivoPreview) URL.revokeObjectURL(archivoPreview);
    setArchivoPreview('');
    setForm(prev => ({ ...prev, imagenUrl: '', imagenUrlAplicada: url, imagenArchivo: null }));
    setQuitarImagen(false);
  };

  /** Guarda el archivo elegido como imagen del área (con vista previa). */
  const seleccionarArchivo = (file: File | null) => {
    if (archivoPreview) URL.revokeObjectURL(archivoPreview);
    setArchivoPreview(file ? URL.createObjectURL(file) : '');
    setForm(prev => ({ ...prev, imagenArchivo: file, imagenUrlAplicada: '', imagenUrl: '' }));
    setQuitarImagen(false);
  };

  const handleSave = useCallback(async () => {
    // Validaciones frontend (mismas reglas de negocio que la BD)
    if (!form.nombre.trim()) { showAlert('El nombre del área es obligatorio.'); return; }
    if (!form.capacidad_max || Number(form.capacidad_max) < 1) { showAlert('La capacidad máxima debe ser al menos 1.'); return; }
    if (form.costo_por_hora === '' || Number(form.costo_por_hora) <= 0) { showAlert('El costo por hora debe ser mayor a 0.'); return; }
    if (!form.hora_apertura || !form.hora_cierre) { showAlert('Debe indicar la hora de apertura y de cierre.'); return; }
    if (form.hora_cierre <= form.hora_apertura) { showAlert('La hora de cierre debe ser mayor que la hora de apertura.'); return; }
    if (!form.max_reservas_semana || Number(form.max_reservas_semana) < 1) { showAlert('El máximo de reservas semanales debe ser al menos 1.'); return; }

    // Validación de ventanas de mantenimiento (mismas reglas que el backend)
    for (const [i, v] of form.mantenimiento.entries()) {
      const num = i + 1;
      if (!v.hora_inicio || !v.hora_fin) {
        showAlert(`Ventana de mantenimiento ${num}: indica la hora de inicio y la hora fin.`);
        return;
      }
      if (v.hora_fin <= v.hora_inicio) {
        showAlert(`Ventana de mantenimiento ${num}: la hora fin debe ser posterior a la hora de inicio.`);
        return;
      }
      if (v.hora_inicio < form.hora_apertura || v.hora_fin > form.hora_cierre) {
        showAlert(`Ventana de mantenimiento ${num}: debe estar dentro del horario del área (${form.hora_apertura} - ${form.hora_cierre}).`);
        return;
      }
    }

    const fd = new FormData();
    fd.append('nombre', form.nombre.trim());
    if (form.descripcion.trim()) fd.append('descripcion', form.descripcion.trim());
    fd.append('capacidad_max', String(Number(form.capacidad_max)));
    fd.append('costo_por_hora', String(Number(form.costo_por_hora)));
    fd.append('hora_apertura', form.hora_apertura);
    fd.append('hora_cierre', form.hora_cierre);
    fd.append('max_reservas_semana', String(Number(form.max_reservas_semana)));

    if (form.imagenArchivo) {
      fd.append('imagen', form.imagenArchivo);
    } else if (drawerMode === 'edit' && quitarImagen) {
      // Quitar imagen: se envía vacío para que el backend la elimine
      fd.append('foto_principal', '');
    } else if (form.imagenUrlAplicada) {
      fd.append('foto_principal', form.imagenUrlAplicada);
    }

    // Ventanas de mantenimiento: siempre se envían al editar ([] = limpiarlas
    // todas); al crear solo si hay alguna.
    if (drawerMode === 'edit' || form.mantenimiento.length > 0) {
      fd.append('mantenimiento', JSON.stringify(form.mantenimiento));
    }

    try {
      if (drawerMode === 'create') {
        const resp = await createArea(fd);
        addActivity(`Nueva área común creada: <strong>${form.nombre.trim()}</strong>`, 'fa-plus-circle', 'var(--accent)');
        addNotification('admin', 'Nueva área', `Se creó el área "${form.nombre.trim()}".`, 'fa-plus-circle', resp?.id_area ?? null);
      } else if (editandoArea?.id_area != null) {
        await updateArea(editandoArea.id_area, fd);
        addActivity(`Área común editada: <strong>${form.nombre.trim()}</strong>`, 'fa-edit', 'var(--accent)');
        addNotification('admin', 'Área editada', `El área "${form.nombre.trim()}" fue actualizada.`, 'fa-edit', editandoArea.id_area);
      }

      setDrawerOpen(false);
      resetForm();
      showAlert('Área guardada correctamente.', { titulo: 'Éxito', tipo: 'success' });
      await cargarAreas();
    } catch (error) {
      showAlert(mensajeErrorAmigable(error), { titulo: 'Error', tipo: 'error' });
    }
  }, [form, drawerMode, editandoArea, quitarImagen, cargarAreas, addActivity, addNotification, showAlert]);

  const handleToggleEstado = useCallback(async () => {
    if (!toggleArea) return;
    const activar = toggleArea.estado !== 'Disponible';
    try {
      if (toggleArea.id_area != null) await toggleEstadoArea(toggleArea.id_area, activar);

      if (activar) {
        addActivity(`Área común habilitada: <strong>${toggleArea.nombre}</strong>`, 'fa-play', 'var(--success)');
        addNotification('admin', 'Área habilitada', `El área "${toggleArea.nombre}" fue habilitada.`, 'fa-play', toggleArea.id_area ?? null);
      } else {
        addActivity(`Área común deshabilitada: <strong>${toggleArea.nombre}</strong>`, 'fa-pause', 'var(--warning)');
        addNotification('admin', 'Área deshabilitada', `El área "${toggleArea.nombre}" fue deshabilitada.`, 'fa-pause', toggleArea.id_area ?? null);
      }

      setToggleArea(null);
      showAlert(activar ? 'Área activada correctamente.' : 'Área deshabilitada correctamente.', { titulo: 'Éxito', tipo: 'success' });
      await cargarAreas();
    } catch (error) {
      showAlert(mensajeErrorAmigable(error), { titulo: 'Error', tipo: 'error' });
    }
  }, [toggleArea, cargarAreas, addActivity, addNotification, showAlert]);

  const renderForm = () => {
    const imagenPreview = form.imagenArchivo
      ? archivoPreview
      : form.imagenUrlAplicada
        ? form.imagenUrlAplicada
        : (drawerMode === 'edit' && editandoArea?.foto_principal && !quitarImagen)
          ? buildAreaImageUrl(editandoArea.foto_principal)
          : null;

    return (
    <>
      <div className="form-section">
        <h4>Información del área</h4>
        <div className="form-row">
          <div className="form-group">
            <label>Nombre *</label>
            <input
              type="text"
              value={form.nombre}
              onChange={e => setCampo('nombre', e.target.value)}
              placeholder="Nombre del área"
            />
          </div>
          <div className="form-group">
            <label>Capacidad máxima (personas) *</label>
            <input
              type="number"
              min={1}
              value={form.capacidad_max}
              onChange={e => setCampo('capacidad_max', e.target.value)}
              placeholder="Ej: 50"
            />
          </div>
        </div>
        <div className="form-group">
          <label>Descripción</label>
          <textarea
            rows={3}
            value={form.descripcion}
            onChange={e => setCampo('descripcion', e.target.value)}
            placeholder="Descripción opcional del área"
          />
        </div>
        <div className="form-row">
          <div className="form-group">
            <label>Hora de apertura *</label>
            <select value={form.hora_apertura} onChange={e => setCampo('hora_apertura', e.target.value)}>
              {HORAS_ENTERAS.map(h => (
                <option key={h} value={h}>{formatHoraAMPM(h)}</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label>Hora de cierre *</label>
            <select value={form.hora_cierre} onChange={e => setCampo('hora_cierre', e.target.value)}>
              {HORAS_ENTERAS.map(h => (
                <option key={h} value={h}>{formatHoraAMPM(h)}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label>Costo por hora (₡) *</label>
            <input
              type="text"
              inputMode="numeric"
              maxLength={8}
              placeholder="₡0"
              title="Formato colones CR: ₡1.234"
              value={form.costo_por_hora ? formatearMoneda(Number(form.costo_por_hora)) : ''}
              onChange={e => setCampo('costo_por_hora', e.target.value.replace(/\D/g, '').slice(0, 8))}
            />
          </div>
          <div className="form-group">
            <label>Máx. reservas por semana</label>
            <input
              type="number"
              min={1}
              value={form.max_reservas_semana}
              onChange={e => setCampo('max_reservas_semana', e.target.value)}
            />
          </div>
        </div>
      </div>

      <div className="form-section">
        <h4>Mantenimiento</h4>
        <small className="form-hint">
          Franjas en las que el área queda bloqueada para reservas (p. ej. limpieza tras cada función del cine).
          Se pueden agregar varias ventanas o dejar vacío si el área no tiene mantenimiento.
        </small>

        <div className="mantenimiento-lista">
          {form.mantenimiento.map((v, i) => (
            <div key={i} className="mantenimiento-fila">
              <select
                value={v.hora_inicio}
                onChange={e => actualizarVentana(i, { hora_inicio: e.target.value })}
              >
                <option value="">Seleccionar...</option>
                {HORAS_ENTERAS.map(h => (
                  <option key={h} value={h}>{formatHoraAMPM(h)}</option>
                ))}
              </select>
              <span>a</span>
              <select
                value={v.hora_fin}
                onChange={e => actualizarVentana(i, { hora_fin: e.target.value })}
              >
                <option value="">Seleccionar...</option>
                {HORAS_ENTERAS.map(h => (
                  <option key={h} value={h}>{formatHoraAMPM(h)}</option>
                ))}
              </select>
              <input
                type="text"
                value={v.descripcion ?? ''}
                placeholder="Descripción (opcional)"
                onChange={e => actualizarVentana(i, { descripcion: e.target.value })}
              />
              <button
                type="button"
                className="btn-quitar"
                onClick={() => quitarVentana(i)}
                title="Quitar ventana"
              >
                <i className="fas fa-times"></i>
              </button>
            </div>
          ))}
        </div>

        <button type="button" className="btn-secondary mantenimiento-agregar" onClick={agregarVentana}>
          <i className="fas fa-plus"></i> Agregar ventana de mantenimiento
        </button>
      </div>

      <div className="form-section">
        <h4>Imagen</h4>

        {imagenPreview && (
          <div className="form-group">
            <img
              src={imagenPreview}
              alt="Vista previa del área"
              style={{ width: 200, height: 120, objectFit: 'cover', borderRadius: 10, display: 'block', border: '1px solid var(--border-color)' }}
            />
          </div>
        )}

        <div className="form-group">
          <label>Imagen por URL</label>
          <div className="url-input-row">
            <input
              type="text"
              value={form.imagenUrl}
              onChange={e => { setCampo('imagenUrl', e.target.value); setQuitarImagen(false); }}
              placeholder="Pegue la dirección de la imagen"
            />
            <button type="button" className="btn-secondary" onClick={aplicarUrl}>
              Aplicar URL
            </button>
          </div>
          {form.imagenUrlAplicada && (
            <small className="form-hint">✓ URL aplicada. Se guardará al guardar el área.</small>
          )}
        </div>

        <div className="form-group">
          <label>O subir desde el dispositivo</label>
          <div className="area-file-upload">
            <label className="btn-secondary area-file-btn">
              <i className="fas fa-upload"></i> Subir archivo
              <input
                type="file"
                hidden
                accept="image/jpeg,image/png,image/gif,image/webp"
                onChange={e => seleccionarArchivo(e.target.files?.[0] ?? null)}
              />
            </label>
            {form.imagenArchivo && (
              <small className="area-file-name">
                <i className="fas fa-file-image"></i> {form.imagenArchivo.name}
              </small>
            )}
          </div>
          <small className="form-hint">JPG, PNG, GIF o WEBP · máximo 2 MB.</small>
        </div>

        {drawerMode === 'edit' && editandoArea?.foto_principal && !form.imagenArchivo && !form.imagenUrlAplicada && !quitarImagen && (
          <button type="button" className="btn-secondary" onClick={() => setQuitarImagen(true)}>
            <i className="fas fa-times"></i> Quitar imagen actual
          </button>
        )}
        {quitarImagen && <small className="form-hint">La imagen actual se eliminará al guardar.</small>}
      </div>
    </>
    );
  };

  return (
    <>
      <PageHeader title="Áreas comunes">
        <button className="btn-primary" onClick={openCreate}>
          <i className="fas fa-plus"></i> Agregar área
        </button>
      </PageHeader>

      {cargando ? (
        <p style={{ color: 'var(--text-muted)' }}>Cargando áreas…</p>
      ) : areas.length === 0 ? (
        <p style={{ color: 'var(--text-muted)' }}>No hay áreas registradas.</p>
      ) : (
        <div className="area-grid" id="areaGrid">
          {areas.map(area => {
            const activa = area.estado === 'Disponible';
            return (
              <div key={area.id_area} className={`area-card ${activa ? '' : 'disabled'}`}>
                <div className="area-img">
                  <img
                    src={area.foto_principal ? buildAreaImageUrl(area.foto_principal) : IMAGEN_PLACEHOLDER}
                    alt={area.nombre}
                  />
                </div>
                <div className="area-body">
                  <h4>{area.nombre}</h4>
                  {area.descripcion && <p className="area-descripcion">{area.descripcion}</p>}
                  <p>Capacidad: {area.capacidad_max} personas</p>
                  <p>
                    Horario: {formatHora(formatearHoraInput(area.hora_apertura))} - {formatHora(formatearHoraInput(area.hora_cierre))}
                  </p>
                  <p>Costo: {area.costo_por_hora != null ? formatearMoneda(area.costo_por_hora) : 'Gratis'}</p>
                  <p>Reservas/semana: {area.max_reservas_semana}</p>
                  <p>
                    <span className={`badge ${activa ? 'badge-success' : 'badge-disabled'}`}>
                      {activa ? 'Disponible' : 'Inactiva'}
                    </span>
                  </p>
                  <div className="area-actions">
                    <a onClick={() => openEdit(area)}>
                      <i className="fas fa-edit"></i> Editar
                    </a>
                    {activa ? (
                      <a className="btn-danger" onClick={() => setToggleArea(area)}>
                        <i className="fas fa-pause"></i> Deshabilitar
                      </a>
                    ) : (
                      <a className="btn-enable" onClick={() => setToggleArea(area)}>
                        <i className="fas fa-play"></i> Activar
                      </a>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Drawer
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title={drawerMode === 'create' ? 'Nueva Área' : 'Editar Área'}
        onSave={handleSave}
        saveText={drawerMode === 'create' ? 'Crear área' : 'Guardar cambios'}
      >
        {renderForm()}
      </Drawer>

      {toggleArea && (
        <Modal
          isOpen={true}
          onClose={() => setToggleArea(null)}
          title={toggleArea.estado === 'Disponible' ? 'Deshabilitar área' : 'Activar área'}
          message={toggleArea.estado === 'Disponible'
            ? `¿Estás seguro de que deseas deshabilitar el área "${toggleArea.nombre}"?`
            : `¿Estás seguro de que deseas activar el área "${toggleArea.nombre}"?`}
          confirmText={toggleArea.estado === 'Disponible' ? 'Deshabilitar' : 'Activar'}
          confirmClassName={toggleArea.estado === 'Disponible' ? 'btn-danger' : 'btn-enable'}
          onConfirm={handleToggleEstado}
        />
      )}
    </>
  );
}
