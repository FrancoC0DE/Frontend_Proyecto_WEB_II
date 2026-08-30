/**
 * Pruebas unitarias para el servicio de autenticación real (authService).
 *
 * Verifica que:
 * - iniciarSesion consuma POST /api/auth/login, devuelva token + usuario mapeado
 *   y guarde la sesión en localStorage
 * - registrarUsuario consuma POST /api/auth/register y NO cree sesión local
 * - verificarCodigo2FA consuma POST /api/auth/2fa/verify, guarde el nuevo token
 *   (2faVerified) y propague los errores del backend
 * - reenviarCodigo2FA consuma POST /api/auth/2fa/send y propague los errores
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Se mockea el cliente HTTP: no se toca la red en los tests
vi.mock('./apiClient', () => {
  class ApiError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.status = status;
    }
  }
  return {
    api: {
      get: vi.fn(),
      post: vi.fn(),
      put: vi.fn(),
      patch: vi.fn(),
      delete: vi.fn(),
    },
    ApiError,
    TOKEN_KEY: 'token',
    USUARIO_KEY: 'usuario',
    rutaPorRol: (rol: string) => rol,
  };
});

import { api, ApiError } from './apiClient';
import { authService } from './authService';

const mockPost = vi.mocked(api.post);

beforeEach(() => {
  localStorage.clear();
  mockPost.mockReset();
});

// ============================================================
// iniciarSesion
// ============================================================
describe('authService.iniciarSesion', () => {
  it('debe llamar a POST /api/auth/login con las credenciales', async () => {
    mockPost.mockResolvedValue({
      token: 'jwt-temporal',
      usuario: { id: 1, nombre: 'Administrador', correo: 'admin@admin.com', rol: 'Administrador' },
    });

    await authService.iniciarSesion({ correo: 'admin@admin.com', contrasena: '123456' });

    expect(mockPost).toHaveBeenCalledWith('/auth/login', {
      correo: 'admin@admin.com',
      contrasena: '123456',
    });
  });

  it('debe devolver el token y el usuario mapeado al shape del frontend', async () => {
    mockPost.mockResolvedValue({
      token: 'jwt-temporal',
      usuario: { id: 1, nombre: 'Administrador', correo: 'admin@admin.com', rol: 'Administrador' },
    });

    const { token, usuario } = await authService.iniciarSesion({
      correo: 'admin@admin.com',
      contrasena: '123456',
    });

    expect(token).toBe('jwt-temporal');
    expect(usuario).toMatchObject({
      idUsuario: 1,
      nombreCompleto: 'Administrador',
      correo: 'admin@admin.com',
      idRol: 1,
      rol: 'Administrador',
      activo: true,
    });
  });

  it('debe guardar token y usuario en localStorage', async () => {
    mockPost.mockResolvedValue({
      token: 'jwt-temporal',
      usuario: { id: 3, nombre: 'Juan Pérez', correo: 'juan@gmail.com', rol: 'Inquilino' },
    });

    await authService.iniciarSesion({ correo: 'juan@gmail.com', contrasena: '123456' });

    expect(localStorage.getItem('token')).toBe('jwt-temporal');
    expect(JSON.parse(localStorage.getItem('usuario') ?? '{}')).toMatchObject({
      idUsuario: 3,
      rol: 'Inquilino',
    });
  });

  it('debe propagar el error del backend si las credenciales son inválidas', async () => {
    mockPost.mockRejectedValue(new Error('Credenciales inválidas'));

    await expect(
      authService.iniciarSesion({ correo: 'malo@malo.com', contrasena: 'x' })
    ).rejects.toThrow('Credenciales inválidas');
  });
});

// ============================================================
// registrarUsuario
// ============================================================
describe('authService.registrarUsuario', () => {
  it('debe llamar a POST /api/auth/register con los datos', async () => {
    mockPost.mockResolvedValue({ message: 'Inquilino registrado exitosamente', id_usuario: 5 });

    const resultado = await authService.registrarUsuario({
      nombreCompleto: 'Juan Pérez',
      correo: 'juan@gmail.com',
      contrasena: 'Secreto123!',
      telefono: '809-555-0100',
    });

    expect(mockPost).toHaveBeenCalledWith('/auth/register', {
      nombreCompleto: 'Juan Pérez',
      correo: 'juan@gmail.com',
      contrasena: 'Secreto123!',
      telefono: '809-555-0100',
    });
    expect(resultado).toMatchObject({ message: 'Inquilino registrado exitosamente', id_usuario: 5 });
  });

  it('NO debe crear sesión local (el registro no devuelve token)', async () => {
    mockPost.mockResolvedValue({ message: 'Inquilino registrado exitosamente', id_usuario: 5 });

    await authService.registrarUsuario({
      nombreCompleto: 'Juan Pérez',
      correo: 'juan@gmail.com',
      contrasena: 'Secreto123!',
    });

    expect(localStorage.getItem('token')).toBeNull();
    expect(localStorage.getItem('usuario')).toBeNull();
  });
});

// ============================================================
// verificarCodigo2FA (real: POST /auth/2fa/verify)
// ============================================================
describe('authService.verificarCodigo2FA', () => {
  it('debe llamar a POST /api/auth/2fa/verify con el código y guardar el nuevo token', async () => {
    mockPost.mockResolvedValue({ token: 'jwt-2fa-verificado', message: 'Verificación exitosa' });

    const resultado = await authService.verificarCodigo2FA('123456');

    expect(mockPost).toHaveBeenCalledWith('/auth/2fa/verify', { codigo: '123456' });
    expect(resultado.token).toBe('jwt-2fa-verificado');
    expect(localStorage.getItem('token')).toBe('jwt-2fa-verificado');
  });

  it('debe propagar el error del backend cuando el código es inválido', async () => {
    mockPost.mockRejectedValue(new ApiError(400, 'Código inválido o expirado'));

    await expect(
      authService.verificarCodigo2FA('000000')
    ).rejects.toThrow('Código inválido o expirado');
    expect(localStorage.getItem('token')).toBeNull();
  });
});

// ============================================================
// reenviarCodigo2FA (real: POST /auth/2fa/send)
// ============================================================
describe('authService.reenviarCodigo2FA', () => {
  it('debe llamar a POST /api/auth/2fa/send', async () => {
    mockPost.mockResolvedValue({ message: 'Código enviado', expira_en: 300 });

    await authService.reenviarCodigo2FA();

    expect(mockPost).toHaveBeenCalledWith('/auth/2fa/send', undefined);
  });

  it('debe marcar el envío como auto (recarga de la página 2FA)', async () => {
    mockPost.mockResolvedValue({
      message: 'Ya tienes un código vigente en tu correo',
      expira_en: 240,
      ya_enviado: true,
    });

    const respuesta = await authService.reenviarCodigo2FA({ auto: true });

    expect(mockPost).toHaveBeenCalledWith('/auth/2fa/send', { auto: true });
    expect(respuesta.ya_enviado).toBe(true);
    expect(respuesta.expira_en).toBe(240);
  });

  it('debe propagar el error si el envío del correo falla', async () => {
    mockPost.mockRejectedValue(
      new ApiError(502, 'No se pudo enviar el correo con el código. Inténtelo nuevamente.')
    );

    await expect(authService.reenviarCodigo2FA()).rejects.toThrow('No se pudo enviar el correo');
  });
});
