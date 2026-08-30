/**
 * ============================================================================
 * Archivo: bankyCheckout.ts
 * ============================================================================
 *
 * ¿Qué hace?
 * Integración con la pasarela de pago BankyFinanzas: el cobro se realiza
 * dentro de una ventana emergente propia de la pasarela. Este sitio nunca
 * recibe el número completo de la tarjeta ni el código de seguridad, solo el
 * resultado del cobro y datos no sensibles (últimos 4 dígitos, marca, etc.).
 *
 * Adaptado de adapt/bankyCheckout.js (ver adapt/ADAPTAR-BANKYCHECKOUT.txt):
 *   - MERCHANT_ID reemplazado por el identificador de comercio real de este
 *     proyecto (obtenido en bankyfinanzas.netlify.app → Afiliar mi negocio →
 *     Credenciales API).
 *   - Moneda por defecto cambiada a CRC (este sitio cobra en colones).
 *   - Puerto a TypeScript (mismas funciones, mismo comportamiento).
 *
 * Se comunica con:
 *   - BankyFinanzas (ventana emergente + postMessage).
 *   - NuevaReservaPage.tsx (pago de reservas) y MisContratosPage.tsx (pago de
 *     mensualidad de contrato) llaman a pagarConBanky() antes de registrar el
 *     pago en el backend.
 * ============================================================================
 */

// Solo el dominio, sin '/checkout': se reutiliza tal cual para comparar
// contra event.origin en el listener de message, que nunca trae path.
export const BANKY_URL = 'https://bankyfinanzas.netlify.app';

// Identificador de comercio de este proyecto (BankyFinanzas → Credenciales API).
// No es secreto: es el dato que el sitio manda en cada cobro.
export const MERCHANT_ID = 'bH0FiSOyB8gSV18tryE6jczTULI3';

const CANAL_CHECKOUT = 'bankyfinanzas:checkout';
const ANCHO_VENTANA = 560;
const ALTO_VENTANA = 760;
const INTERVALO_VIGILANCIA_MS = 500;

const MENSAJES_RECHAZO: Record<string, string> = {
    INSUFFICIENT_FUNDS: 'La tarjeta no tiene fondos suficientes.',
    CARD_EXPIRED: 'La tarjeta se encuentra vencida.',
    CARD_DECLINED: 'El cobro supera el límite permitido por transacción.',
    INVALID_CARD: 'Los datos de la tarjeta no son válidos.',
    NETWORK_ERROR: 'No se pudo contactar al banco emisor.',
};

export interface DatosCobroBanky {
    /** Número de orden interno (para relacionar el cobro con la venta). */
    orderId: string;
    /** Monto en colones (o la moneda indicada), sin puntos ni comas. */
    amount: number;
    /** Concepto que verá el cliente en la ventana de pago. */
    description: string;
    /** Opcional: 'CRC' (por defecto) o 'USD'. */
    currency?: 'CRC' | 'USD';
}

export type ResultadoBanky =
    | {
        status: 'completed';
        transactionCode: string;
        cardBrand?: string;
        cardLastFourDigits?: string;
        cardExpiration?: string;
        cardholderName?: string;
    }
    | { status: 'rejected'; rejectionCode?: string }
    | { status: 'cancelled' };

function construirUrlCheckout(datos: DatosCobroBanky): string {
    // El dominio de este sitio es obligatorio: sin él, BankyFinanzas no
    // sabe a qué origen enviarle el postMessage con el resultado.
    const parametros = new URLSearchParams({
        merchantId: MERCHANT_ID,
        orderId: datos.orderId,
        amount: String(datos.amount),
        description: datos.description,
        currency: datos.currency || 'CRC',
        origin: window.location.origin,
    });

    return `${BANKY_URL}/checkout?${parametros.toString()}`;
}

export function pagarConBanky(datos: DatosCobroBanky): Promise<ResultadoBanky> {
    return new Promise((resolve, reject) => {
        const url = construirUrlCheckout(datos);

        const ventana = window.open(
            url,
            'bankyfinanzas-checkout',
            `width=${ANCHO_VENTANA},height=${ALTO_VENTANA}`,
        );

        if (!ventana) {
            reject(new Error(
                'El navegador bloqueó la ventana de pago de '
                + 'BankyFinanzas. Habilita las ventanas emergentes '
                + 'para este sitio e intenta de nuevo.',
            ));

            return;
        }

        let finalizado = false;

        function limpiar() {
            window.removeEventListener('message', manejarMensaje);
            clearInterval(intervaloVigilancia);
        }

        function manejarMensaje(evento: MessageEvent) {
            if (evento.origin !== BANKY_URL) {
                return;
            }

            const datos = evento.data || {};

            if (datos.channel !== CANAL_CHECKOUT) {
                return;
            }

            if (!datos.result) {
                return;
            }

            finalizado = true;
            limpiar();
            resolve(datos.result as ResultadoBanky);
        }

        // Sin este vigía, si el usuario cierra la ventana sin pagar
        // la promesa quedaría pendiente para siempre y la pantalla
        // se congelaría en el estado de procesando.
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

export function describirResultado(resultado: ResultadoBanky | undefined): string {
    if (resultado?.status === 'completed') {
        return 'El pago se procesó correctamente.';
    }

    if (resultado?.status === 'cancelled') {
        return 'El pago fue cancelado antes de finalizar.';
    }

    if (resultado?.status === 'rejected') {
        return MENSAJES_RECHAZO[resultado.rejectionCode ?? '']
            || 'El pago fue rechazado por el banco emisor.';
    }

    return 'No fue posible determinar el resultado del pago.';
}

export function aMetodoDePago(resultado: ResultadoBanky) {
    const r = resultado.status === 'completed' ? resultado : undefined;
    return {
        titular: r?.cardholderName || '',
        tipoTarjeta: r?.cardBrand || '',
        ultimosDigitos: r?.cardLastFourDigits || '',
        vencimiento: r?.cardExpiration || '',
    };
}
