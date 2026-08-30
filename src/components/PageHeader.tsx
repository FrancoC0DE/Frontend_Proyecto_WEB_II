/**
 * ============================================================================
 * Archivo: PageHeader.tsx
 * ============================================================================
 *
 * ¿Qué hace?
 * Componente simple que muestra el encabezado de una página con un título
 * y botones de acción opcionales (ej: botón "Agregar área").
 *
 * Props que recibe
 * - title: string → Título de la página
 * - children?: ReactNode → Botones de acción (opcional)
 *
 * Quién lo utiliza
 * - AreasPage, PersonalPage, VisitasPage, PagosPage, etc.
 *
 * ============================================================================
 */

import type { ReactNode } from 'react';

interface PageHeaderProps {
  title: string;
  children?: ReactNode;
}

export default function PageHeader({ title, children }: PageHeaderProps) {
  return (
    <div className="page-header">
      <h2>{title}</h2>
      {children && <div className="actions">{children}</div>}
    </div>
  );
}
