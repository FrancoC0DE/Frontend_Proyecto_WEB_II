/**
 * ============================================================================
 * Archivo: hsmSignCheckout.ts
 * ============================================================================
 *
 * ¿Qué hace?
 * Integración con HSM Sign CR (Firma Digital real): la firma se realiza
 * dentro de una ventana propia del servicio. Este sitio NUNCA recibe el PIN
 * de firma del administrador, solo el resultado (el documento ya firmado o
 * el motivo del error) — igual que BankyFinanzas con el número de tarjeta.
 *
 * Adaptado de adapt/hsmSignCheckout.js a TypeScript (misma lógica).
 * Se usa desde el panel de Administrador (FacturacionPage.tsx) para firmar
 * el XML de una factura pendiente antes de enviarla a Mini Tributación.
 * ============================================================================
 */

// HSM Sign CR sirve el frontend Y la API desde el mismo origen.
const HSM_URL = 'https://hsm-sign-cr.onrender.com';

export const HSM_SIGN_URL = HSM_URL;

const CANAL_LISTO = 'hsmsigncr:listo';
const CANAL_FIRMA = 'hsmsigncr:firmar';
const ANCHO_VENTANA = 480;
const ALTO_VENTANA = 640;
const INTERVALO_VIGILANCIA_MS = 500;

const MENSAJES_ERROR: Record<string, string> = {
    PIN_INCORRECTO: 'El PIN de firma es incorrecto.',
    SIN_CERTIFICADO: 'El contribuyente no tiene un certificado digital vigente.',
    NO_ENCONTRADO: 'No existe un contribuyente con esa identificación en HSM Sign CR.',
};

export interface DatosFirma {
    /** Cédula/DIMEX del contribuyente (el negocio, no el cliente). */
    identificacion: string;
    /** El XML sin firmar, como texto. */
    xmlFactura: string;
}

export type ResultadoFirma =
    | { status: 'completed'; xmlFirmado: string; hashDocumento?: string; serialCertificado?: string }
    | { status: 'rejected'; rejectionCode?: string; motivo?: string }
    | { status: 'cancelled' };

function construirUrlPopup(): string {
    const parametros = new URLSearchParams({ origin: window.location.origin });
    return `${HSM_SIGN_URL}/firmar_popup.html?${parametros.toString()}`;
}

/**
 * Abre el popup de HSM Sign CR para firmar un XML. El administrador escribe
 * su identificación y PIN directamente en el popup (nunca en este sitio).
 */
export function firmarConHSMSignCR(datos: DatosFirma): Promise<ResultadoFirma> {
    return new Promise((resolve, reject) => {
        const url = construirUrlPopup();

        const ventana = window.open(url, 'hsmsigncr-firmar', `width=${ANCHO_VENTANA},height=${ALTO_VENTANA}`);

        if (!ventana) {
            reject(new Error(
                'El navegador bloqueó la ventana de firma de HSM Sign CR. '
                + 'Habilita las ventanas emergentes para este sitio e intenta de nuevo.',
            ));
            return;
        }

        let finalizado = false;

        function limpiar() {
            window.removeEventListener('message', manejarMensaje);
            clearInterval(intervaloVigilancia);
        }

        function manejarMensaje(evento: MessageEvent) {
            if (evento.origin !== HSM_SIGN_URL) return;

            const mensaje = evento.data || {};

            // El popup avisa que ya cargó; se le manda el XML por postMessage
            // (no cabe en un query string).
            if (mensaje.channel === CANAL_LISTO) {
                ventana.postMessage(
                    { channel: CANAL_FIRMA, identificacion: datos.identificacion, xmlFactura: datos.xmlFactura },
                    HSM_SIGN_URL,
                );
                return;
            }

            if (mensaje.channel !== CANAL_FIRMA) return;
            if (!mensaje.result) return;

            finalizado = true;
            limpiar();
            resolve(mensaje.result as ResultadoFirma);
        }

        const intervaloVigilancia = setInterval(() => {
            if (ventana.closed && !finalizado) {
                finalizado = true;
                limpiar();
                resolve({ status: 'cancelled' });
            }
        }, INTERVALO_VIGILANCIA_MS);

        window.addEventListener('message', manejarMensaje);
    });
}

export function describirResultadoFirma(resultado: ResultadoFirma | undefined): string {
    if (resultado?.status === 'completed') return 'El documento se firmó correctamente.';
    if (resultado?.status === 'cancelled') return 'La firma fue cancelada antes de completarse.';
    if (resultado?.status === 'rejected') {
        return MENSAJES_ERROR[resultado.rejectionCode ?? ''] || resultado.motivo || 'No se pudo firmar el documento.';
    }
    return 'No fue posible determinar el resultado de la firma.';
}
